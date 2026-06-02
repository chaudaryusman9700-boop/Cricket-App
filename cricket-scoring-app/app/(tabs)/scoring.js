import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  ScrollView,
  TouchableOpacity,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';
import { useLocalSearchParams, useRouter } from 'expo-router';

export default function HomeScreen() {

  // ── Read data passed from SetupScreen via Expo Router ──
  const params = useLocalSearchParams();
  const router = useRouter();
  const setup = params?.matchSetup ? JSON.parse(params.matchSetup) : null;
  const resumeData = params?.resumeMatch ? JSON.parse(params.resumeMatch) : null;

  const battingPlayers = setup?.battingPlayers || ["Usman", "Ali", "Ahmed", "Bilal", "Hassan"];
  const bowlingPlayers = setup?.bowlingPlayers || ["Zahid", "Imran", "Saad"];

  // ── If resuming, use saved match data directly ──
  const getInitialMatch = () => {
    if (resumeData) {
      const m = resumeData.match || resumeData;
      return {
        ...m,
        ballHistory: m.ballHistory || [],
        snapshots: [],
      };
    }
    return {
    runs: 0,
    wickets: 0,
    balls: 0,
    totalOvers: setup?.totalOvers || 10,
    battingTeam: setup?.battingTeam || 'Team A',
    bowlingTeam: setup?.battingTeam === setup?.teamA?.name
      ? setup?.teamB?.name
      : setup?.teamA?.name || 'Team B',
    venue: setup?.venue || '',
    matchDate: setup?.matchDate || '',
    matchTime: setup?.matchTime || '',
    players: battingPlayers,
    bowlingPlayers: bowlingPlayers,
    striker: battingPlayers[0] || '',
    nonStriker: battingPlayers[1] || '',
    bowler: bowlingPlayers[0] || '',
    ballHistory: [],
    snapshots: [],
    };
  };

  // 🧠 MAIN MATCH STATE
  const [match, setMatch] = useState(getInitialMatch());

  const [batsmenStats, setBatsmenStats] = useState(resumeData?.batsmenStats || {});
  const [bowlerStats, setBowlerStats] = useState(resumeData?.bowlerStats || {});
  const [newPlayer, setNewPlayer] = useState('');
  const [showNewBatsmanModal, setShowNewBatsmanModal] = useState(false);
  const [selectedNewBatsman, setSelectedNewBatsman] = useState('');
  const [inningsOver, setInningsOver] = useState(false);
  // For new match (setup passed) always start innings at 1
  const [innings, setInnings] = useState(
    setup ? 1 : (resumeData?.match?.innings || 1)
  );
  const [firstInningsScore, setFirstInningsScore] = useState(null);
  const [showInningsModal, setShowInningsModal] = useState(
    // Only auto-show if resuming (not new match) after 1st innings ended
    !setup && resumeData?.match?.inningsEnded && (resumeData?.match?.innings || 1) === 1
  );
  const [matchResult, setMatchResult] = useState(null);

  useEffect(() => {
    if (setup) {
      // ── Fresh new match — clear ALL stale data ──
      AsyncStorage.removeItem('firstInnings').catch(() => {});
      AsyncStorage.removeItem('matchResult').catch(() => {});
    } else if (resumeData) {
      // ── Resuming — restore first innings score if 1st innings ended ──
      if (resumeData?.match?.inningsEnded) {
        const m = resumeData.match;
        setFirstInningsScore({
          runs: m.runs,
          wickets: m.wickets,
          balls: m.balls,
          team: m.battingTeam,
        });
      }
    } else {
      // ── App opened directly — load from AsyncStorage ──
      loadMatch();
    }
  }, []);

  // ─── SAVE / LOAD ────────────────────────────────────────────────
  const saveMatch = async () => {
    try {
      const key = 'match_' + Date.now();
      const payload = JSON.stringify({ match, batsmenStats, bowlerStats, savedAt: Date.now() });
      await AsyncStorage.setItem(key, payload);
      await AsyncStorage.setItem('currentMatch', payload);
      Alert.alert('Saved', 'Match saved to history ✅');
    } catch {
      Alert.alert('Error', 'Save failed ❌');
    }
  };

  const loadMatch = async () => {
    try {
      const data = await AsyncStorage.getItem('currentMatch');
      if (data) {
        const parsed = JSON.parse(data);
        const loadedMatch = parsed.match || parsed;
        setMatch(prev => ({
          ...prev,
          ...loadedMatch,
          ballHistory: loadedMatch.ballHistory || [],
          snapshots: loadedMatch.snapshots || [],
        }));
        setBatsmenStats(parsed.batsmenStats || {});
        setBowlerStats(parsed.bowlerStats || {});
      }
    } catch (e) {
      console.log(e);
    }
  };

  // ─── ADD PLAYER ─────────────────────────────────────────────────
  const addPlayer = () => {
    const name = newPlayer.trim();
    if (!name) return;
    if (match.players.includes(name)) {
      Alert.alert('Duplicate', `${name} is already in the squad.`);
      return;
    }
    Alert.alert('Add Player', `Add "${name}" to the squad?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Add',
        onPress: () => {
          setMatch(prev => ({ ...prev, players: [...prev.players, name] }));
          setNewPlayer('');
        }
      }
    ]);
  };

  // ─── UNDO LAST BALL ─────────────────────────────────────────────
  const undoLastBall = () => {
    if (!match.snapshots || match.snapshots.length === 0) {
      Alert.alert('Nothing to undo', 'No balls have been recorded yet.');
      return;
    }
    Alert.alert('Undo', 'Remove the last ball?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Undo',
        style: 'destructive',
        onPress: () => {
          const snapshots = [...match.snapshots];
          const prev = snapshots.pop();
          setMatch({ ...prev.match, snapshots });
          setBatsmenStats(prev.batsmenStats);
          setBowlerStats(prev.bowlerStats);
        }
      }
    ]);
  };

  // ─── CORE ENGINE ────────────────────────────────────────────────
  const addBall = (type, run = 0) => {

    // Check match is over
    if (match.balls >= match.totalOvers * 6) {
      Alert.alert('Match Over', 'All overs have been bowled!');
      return;
    }

    const snapshot = {
      match: { ...match, snapshots: [] },
      batsmenStats: { ...batsmenStats },
      bowlerStats: { ...bowlerStats },
    };

    let updated = { ...match };
    let newBatsmenStats = { ...batsmenStats };
    let newBowlerStats = { ...bowlerStats };

    if (!newBowlerStats[updated.bowler]) {
      newBowlerStats[updated.bowler] = { runs: 0, balls: 0, wickets: 0 };
    }

    const ballEvent = {
      id: Date.now().toString(),
      over: `${Math.floor(match.balls / 6)}.${match.balls % 6}`,
      striker: match.striker,
      bowler: match.bowler,
      type,
      run,
      text: ''
    };

    if (type === 'run') {
      if (!newBatsmenStats[updated.striker])
        newBatsmenStats[updated.striker] = { runs: 0, balls: 0 };
      newBatsmenStats[updated.striker].runs += run;
      newBatsmenStats[updated.striker].balls += 1;
      newBowlerStats[updated.bowler].runs += run;
      newBowlerStats[updated.bowler].balls += 1;
      updated.runs += run;
      updated.balls += 1;
      ballEvent.text = run === 0 ? 'Dot' : `${run} Run${run > 1 ? 's' : ''}`;
      if (run % 2 !== 0)
        [updated.striker, updated.nonStriker] = [updated.nonStriker, updated.striker];
    }

    else if (type === 'dot') {
      if (!newBatsmenStats[updated.striker])
        newBatsmenStats[updated.striker] = { runs: 0, balls: 0 };
      newBatsmenStats[updated.striker].balls += 1;
      newBowlerStats[updated.bowler].balls += 1;
      updated.balls += 1;
      ballEvent.text = 'Dot Ball';
    }

    else if (type === 'wicket') {
      newBowlerStats[updated.bowler].wickets += 1;
      newBowlerStats[updated.bowler].balls += 1;
      updated.wickets += 1;
      updated.balls += 1;
      ballEvent.text = 'WICKET';
    }

    else if (type === 'wide') {
      updated.runs += 1;
      newBowlerStats[updated.bowler].runs += 1;
      ballEvent.text = 'Wide +1';
    }

    else if (type === 'wideRun') {
      updated.runs += (1 + run);
      newBowlerStats[updated.bowler].runs += (1 + run);
      ballEvent.text = `Wide + ${run} = ${1 + run}`;
    }

    else if (type === 'wideBoundary') {
      updated.runs += 5;
      newBowlerStats[updated.bowler].runs += 5;
      ballEvent.text = 'Wide Boundary (5)';
    }

    else if (type === 'noBall') {
      updated.runs += 1;
      newBowlerStats[updated.bowler].runs += 1;
      ballEvent.text = 'No Ball +1';
    }

    else if (type === 'noBallRun') {
      updated.runs += (1 + run);
      updated.balls += 1;
      newBowlerStats[updated.bowler].runs += (1 + run);
      ballEvent.text = `No Ball + ${run}`;
    }

    else if (type === 'bye') {
      updated.runs += run;
      updated.balls += 1;
      ballEvent.text = `Bye ${run}`;
      if (run % 2 !== 0)
        [updated.striker, updated.nonStriker] = [updated.nonStriker, updated.striker];
    }

    else if (type === 'byeBoundary') {
      updated.runs += 4;
      updated.balls += 1;
      ballEvent.text = 'Bye 4';
    }

    updated.snapshots = [...(match.snapshots || []), snapshot];
    updated.ballHistory = [ballEvent, ...(updated.ballHistory || [])];

    // ── END OF OVER ──
    const isLegalBall = ['run', 'dot', 'wicket', 'bye', 'byeBoundary', 'noBallRun'].includes(type);
    if (isLegalBall && updated.balls % 6 === 0 && updated.balls > 0) {
      [updated.striker, updated.nonStriker] = [updated.nonStriker, updated.striker];
      Alert.alert(
        'Over Complete!',
        `End of over ${Math.floor(updated.balls / 6)}.\nStriker is now: ${updated.striker}`
      );
    }

    // ── CHECK INNINGS END: all out OR overs complete ──
    const allOut = updated.wickets >= updated.players.length - 1;
    const oversComplete = updated.balls >= updated.totalOvers * 6;

    if (allOut || oversComplete) {
      const reason = allOut ? 'All Out!' : 'Overs Complete!';
      updated.inningsEnded = true;
      updated.innings = innings;
      setInningsOver(true);
      setFirstInningsScore({ runs: updated.runs, wickets: updated.wickets, balls: updated.balls, team: updated.battingTeam });
      setShowInningsModal(true);
    }

    setBatsmenStats(newBatsmenStats);
    setBowlerStats(newBowlerStats);

    if (type === 'wicket') {
      // Don't show new batsman modal if innings is already over
      const allOut = updated.wickets >= updated.players.length - 1;
      const oversComplete = updated.balls >= updated.totalOvers * 6;
      if (!allOut && !oversComplete) {
        const avail = updated.players.filter(
          p => p !== updated.nonStriker && p !== updated.bowler
        );
        // Auto-set next batsman immediately so buttons update right away
        const nextBatsman = avail[0] || '';
        updated.striker = nextBatsman;
        setSelectedNewBatsman(nextBatsman);
        setMatch(updated);
        setShowNewBatsmanModal(true);
      } else {
        setMatch(updated);
      }
    } else {
      setMatch(updated);
    }
  };

  // ── After wicket: confirm new batsman ──
  const confirmNewBatsman = () => {
    if (!selectedNewBatsman) return;
    // Update striker immediately when confirmed
    setMatch(prev => ({ ...prev, striker: selectedNewBatsman }));
    setShowNewBatsmanModal(false);
    Alert.alert(
      '🏏 New Batsman',
      `${selectedNewBatsman} is coming in to bat on strike.`
    );
  };

  // ── Start second innings ──
  const startSecondInnings = () => {
    // Correctly identify teams using setup data
    const team1Name = setup?.teamA?.name || match.battingTeam || 'Team A';
    const team2Name = setup?.teamB?.name || match.bowlingTeam || 'Team B';
    const team1Players = setup?.teamA?.players || [];
    const team2Players = setup?.teamB?.players || [];

    // Batting team for 1st innings was stored — 2nd innings is the other team
    const firstBattingTeam = firstInningsScore?.team || match.battingTeam;
    const newBattingTeam = firstBattingTeam === team1Name ? team2Name : team1Name;
    const newBowlingTeam = firstBattingTeam === team1Name ? team1Name : team2Name;
    const newBattingPlayers = firstBattingTeam === team1Name
      ? (team2Players.length > 0 ? team2Players : match.bowlingPlayers || [])
      : (team1Players.length > 0 ? team1Players : match.players || []);
    const newBowlingPlayers = firstBattingTeam === team1Name
      ? (team1Players.length > 0 ? team1Players : match.players || [])
      : (team2Players.length > 0 ? team2Players : match.bowlingPlayers || []);
    const target = (firstInningsScore?.runs || 0) + 1;

    // Save first innings full stats to AsyncStorage
    const firstInningsData = {
      team: match.battingTeam,
      runs: match.runs,
      wickets: match.wickets,
      balls: match.balls,
      batsmenStats: { ...batsmenStats },
      bowlerStats: { ...bowlerStats },
      ballHistory: [...(match.ballHistory || [])],
    };
    AsyncStorage.setItem('firstInnings', JSON.stringify(firstInningsData)).catch(() => {});

    setMatch({
      runs: 0,
      wickets: 0,
      balls: 0,
      totalOvers: match.totalOvers,
      battingTeam: newBattingTeam,
      bowlingTeam: newBowlingTeam,
      venue: match.venue,
      matchDate: match.matchDate,
      matchTime: match.matchTime,
      players: newBattingPlayers,
      bowlingPlayers: newBowlingPlayers,
      striker: newBattingPlayers[0] || '',
      nonStriker: newBattingPlayers[1] || '',
      bowler: newBowlingPlayers[0] || '',
      ballHistory: [],
      snapshots: [],
      target,
    });

    setBatsmenStats({});
    setBowlerStats({});
    setInnings(2);
    setInningsOver(false);
    setShowInningsModal(false);

    Alert.alert(
      '2nd Innings Started!',
      `${newBattingTeam} needs ${target} runs to win in ${match.totalOvers} overs.`
    );
  };

  // ── Calculate Man of the Match ──
  const getManOfTheMatch = (winnerTeam, allBatsmenStats, allBowlerStats) => {
    let best = null;
    let bestScore = -1;

    // Score each player
    const allPlayers = new Set([
      ...Object.keys(allBatsmenStats || {}),
      ...Object.keys(allBowlerStats || {})
    ]);

    allPlayers.forEach(name => {
      const bat = allBatsmenStats?.[name] || { runs: 0, balls: 0 };
      const bowl = allBowlerStats?.[name] || { wickets: 0, balls: 0, runs: 0 };
      const sr = bat.balls > 0 ? (bat.runs / bat.balls) * 100 : 0;
      const eco = bowl.balls > 0 ? bowl.runs / (bowl.balls / 6) : 99;

      // Performance score formula
      let score = (bat.runs * 1.5) + (bowl.wickets * 25) + (sr > 150 ? 10 : 0) + (eco < 6 ? 15 : 0);

      // Bonus for winning team
      const isWinner = match.players.includes(name) || match.bowlingPlayers.includes(name);
      if (isWinner) score *= 1.3;

      if (score > bestScore) {
        bestScore = score;
        best = {
          name,
          runs: bat.runs,
          balls: bat.balls,
          wickets: bowl.wickets,
          score: Math.round(score),
        };
      }
    });

    return best;
  };

  // ── Check match result in 2nd innings ──
  // ── Save and show match result ──
  const showMatchResult = (resultData, updated) => {
    setMatchResult(resultData);
    AsyncStorage.setItem('matchResult', JSON.stringify(resultData)).catch(() => {});
    setFirstInningsScore(prev => ({ ...prev, result: resultData }));
    setShowInningsModal(true);
  };

  const checkMatchResult = (updated) => {
    if (innings !== 2 || !firstInningsScore) return false;
    const fi = firstInningsScore;
    const target = fi.runs + 1;
    const allOut = updated.wickets >= updated.players.length - 1;
    const oversComplete = updated.balls >= updated.totalOvers * 6;
    const chasersTeam = updated.battingTeam;
    const defendersTeam = fi.team || match.bowlingTeam || 'Team A';
    const motm = getManOfTheMatch(updated.battingTeam, batsmenStats, bowlerStats);

    // ── Chasing team reached target ──
    if (updated.runs >= target) {
      // Use 10 as max wickets if players array has wrong count
      const maxWickets = Math.max(updated.players.length - 1, 10);
      const wicketsLeft = maxWickets - updated.wickets;
      const wicketWord = wicketsLeft === 1 ? '1 wicket' : `${wicketsLeft} wickets`;
      const resultData = {
        winner: chasersTeam,
        loser: defendersTeam,
        resultType: 'wickets',
        margin: wicketWord,
        resultText: `${chasersTeam} won by ${wicketWord}`,
        firstTeam: defendersTeam,
        firstScore: `${fi.runs}/${fi.wickets}`,
        secondTeam: chasersTeam,
        secondScore: `${updated.runs}/${updated.wickets}`,
        target,
        motm: motm?.name || '—',
        motmRuns: motm?.runs || 0,
        motmWickets: motm?.wickets || 0,
      };
      showMatchResult(resultData, updated);
      Alert.alert(
        '🏆 ' + chasersTeam + ' Won!',
        `${chasersTeam} beat ${defendersTeam} by ${resultData.margin}
` +
        `${chasersTeam}: ${updated.runs}/${updated.wickets}
` +
        `${defendersTeam}: ${fi.runs}/${fi.wickets}

` +
        `🌟 Man of the Match: ${motm?.name || '—'}
` +
        `${motm?.runs || 0} runs · ${motm?.wickets || 0} wickets`,
        [{ text: 'View Scorecard', onPress: () => router.push('/scorecard') }]
      );
      return true;
    }

    // ── 2nd innings ended (all out or overs done) ──
    if (allOut || oversComplete) {
      const runsShort = fi.runs - updated.runs;

      // ── Tie ──
      if (updated.runs === fi.runs) {
        const resultData = {
          winner: null,
          resultType: 'tie',
          resultText: 'Match Tied!',
          firstTeam: defendersTeam,
          firstScore: `${fi.runs}/${fi.wickets}`,
          secondTeam: chasersTeam,
          secondScore: `${updated.runs}/${updated.wickets}`,
          target,
          motm: motm?.name || '—',
          motmRuns: motm?.runs || 0,
          motmWickets: motm?.wickets || 0,
        };
        showMatchResult(resultData, updated);
        Alert.alert(
          '🤝 Match Tied!',
          `Both teams scored ${fi.runs} runs!
` +
          `${defendersTeam}: ${fi.runs}/${fi.wickets}
` +
          `${chasersTeam}: ${updated.runs}/${updated.wickets}

` +
          `🌟 Man of the Match: ${motm?.name || '—'}`,
          [{ text: 'View Scorecard', onPress: () => router.push('/scorecard') }]
        );
        return true;
      }

      // ── Defending team wins by runs ──
      const resultData = {
        winner: defendersTeam,
        loser: chasersTeam,
        resultType: 'runs',
        margin: runsShort === 1 ? '1 run' : `${runsShort} runs`,
        resultText: `${defendersTeam} won by ${runsShort === 1 ? '1 run' : runsShort + ' runs'}`,
        firstTeam: defendersTeam,
        firstScore: `${fi.runs}/${fi.wickets}`,
        secondTeam: chasersTeam,
        secondScore: `${updated.runs}/${updated.wickets}`,
        target,
        motm: motm?.name || '—',
        motmRuns: motm?.runs || 0,
        motmWickets: motm?.wickets || 0,
      };
      showMatchResult(resultData, updated);
      Alert.alert(
        '🏆 ' + defendersTeam + ' Won!',
        `${defendersTeam} beat ${chasersTeam} by ${resultData.margin}
` +
        `${defendersTeam}: ${fi.runs}/${fi.wickets}
` +
        `${chasersTeam}: ${updated.runs}/${updated.wickets}

` +
        `🌟 Man of the Match: ${motm?.name || '—'}
` +
        `${motm?.runs || 0} runs · ${motm?.wickets || 0} wickets`,
        [{ text: 'View Scorecard', onPress: () => router.push('/scorecard') }]
      );
      return true;
    }
    return false;
  };

  // ─── HELPERS ────────────────────────────────────────────────────
  const getOvers = () => `${Math.floor(match.balls / 6)}.${match.balls % 6}`;

  const getRunRate = () => {
    if (match.balls === 0) return '0.00';
    return (match.runs / (match.balls / 6)).toFixed(2);
  };

  const getRequiredRunRate = () => {
    if (innings !== 2 || !match.target) return null;
    const runsNeeded = match.target - match.runs;
    const ballsLeft = (match.totalOvers * 6) - match.balls;
    if (ballsLeft <= 0) return null;
    if (runsNeeded <= 0) return '0.00';
    const oversLeft = ballsLeft / 6;
    return (runsNeeded / oversLeft).toFixed(2);
  };

  const getMatchStatus = () => {
    if (innings !== 2 || !match.target) return null;
    const runsNeeded = match.target - match.runs;
    const ballsLeft = (match.totalOvers * 6) - match.balls;
    const oversLeft = Math.floor(ballsLeft / 6);
    const ballsRem = ballsLeft % 6;
    const wicketsLeft = (match.players.length - 1) - match.wickets;
    if (runsNeeded <= 0) return 'Target achieved!';
    return `Need ${runsNeeded} runs in ${oversLeft}.${ballsRem} overs (${wicketsLeft} wickets left)`;
  };

  const getOverLog = () => {
    const overs = {};
    [...(match.ballHistory || [])].reverse().forEach(b => {
      const overNum = b.over.split('.')[0];
      if (!overs[overNum]) overs[overNum] = [];
      overs[overNum].push(b);
    });
    return overs;
  };

  const strikeRate = (p) => {
    if (!batsmenStats[p] || batsmenStats[p].balls === 0) return '0.0';
    return ((batsmenStats[p].runs / batsmenStats[p].balls) * 100).toFixed(1);
  };

  const economy = (b) => {
    if (!bowlerStats[b] || bowlerStats[b].balls === 0) return '0.0';
    return (bowlerStats[b].runs / (bowlerStats[b].balls / 6)).toFixed(1);
  };

  const overLog = getOverLog();

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: '#0f172a' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={Platform.OS === 'ios'}
    >
    <ScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >

      {/* ── NEW BATSMAN MODAL ── */}
      <Modal visible={showNewBatsmanModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Wicket! Select New Batsman</Text>
            <Picker
              selectedValue={selectedNewBatsman}
              onValueChange={setSelectedNewBatsman}
              style={{ color: '#fff' }}
            >
              {match.players
                .filter(p => p !== match.nonStriker && p !== match.bowler)
                .map((p, i) => <Picker.Item key={i} label={p} value={p} />)}
            </Picker>
            <TouchableOpacity style={styles.btnGreen} onPress={confirmNewBatsman}>
              <Text style={styles.btnText}>Confirm</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── INNINGS COMPLETE MODAL ── */}
      <Modal visible={showInningsModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              {innings === 1 ? '1st Innings Complete!' : 'Match Over!'}
            </Text>
            <Text style={{ color: '#94a3b8', textAlign: 'center', marginBottom: 8 }}>
              {firstInningsScore?.team} scored
            </Text>
            <Text style={{ color: '#38bdf8', fontSize: 40, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 }}>
              {firstInningsScore?.runs}/{firstInningsScore?.wickets}
            </Text>
            {innings === 1 && (
              <>
                <Text style={{ color: '#94a3b8', textAlign: 'center', marginBottom: 4 }}>
                  1st Innings Complete
                </Text>
                <Text style={{ color: '#22c55e', fontWeight: 'bold', textAlign: 'center', fontSize: 15, marginBottom: 16 }}>
                  {(() => {
                    const team1 = setup?.teamA?.name || 'Team A';
                    const team2 = setup?.teamB?.name || 'Team B';
                    const firstTeam = firstInningsScore?.team || match.battingTeam;
                    return firstTeam === team1 ? team2 : team1;
                  })()} needs {(firstInningsScore?.runs || 0) + 1} runs to win in {match.totalOvers} overs
                </Text>
                <TouchableOpacity style={styles.btnGreen} onPress={startSecondInnings}>
                  <Text style={styles.btnText}>Start 2nd Innings →</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.btnGreen, { backgroundColor: '#334155', marginTop: 10 }]}
                  onPress={() => { setShowInningsModal(false); router.push('/history'); }}>
                  <Text style={styles.btnText}>End Match & Save</Text>
                </TouchableOpacity>
              </>
            )}
            {innings === 2 && (() => {
              const motm = getManOfTheMatch(match.battingTeam, batsmenStats, bowlerStats);
              const fi = firstInningsScore;
              const resultData = matchResult;
              return (
                <>
                  {/* Match result banner */}
                  {resultData && (
                    <View style={{ backgroundColor: '#0f172a', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      <Text style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: 18, textAlign: 'center' }}>
                        {resultData.resultType === 'tie' ? '🤝 Match Tied!' : `🏆 ${resultData.winner} Won!`}
                      </Text>
                      {resultData.resultType !== 'tie' && (
                        <Text style={{ color: '#94a3b8', fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                          by {resultData.margin}
                        </Text>
                      )}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 }}>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ color: '#64748b', fontSize: 11 }}>1st Inn</Text>
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{resultData.firstScore}</Text>
                          <Text style={{ color: '#94a3b8', fontSize: 11 }}>{resultData.firstTeam}</Text>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ color: '#64748b', fontSize: 11 }}>2nd Inn</Text>
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{resultData.secondScore}</Text>
                          <Text style={{ color: '#94a3b8', fontSize: 11 }}>{resultData.secondTeam}</Text>
                        </View>
                      </View>
                    </View>
                  )}
                  {/* Man of the Match */}
                  {motm && (
                    <View style={{ backgroundColor: '#1a1a0a', borderRadius: 12, padding: 12, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: '#f59e0b' }}>
                      <Text style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>🌟 Man of the Match</Text>
                      <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{motm.name}</Text>
                      <Text style={{ color: '#94a3b8', fontSize: 12, marginTop: 4 }}>
                        {motm.runs > 0 ? `${motm.runs} runs (${motm.balls}b)` : ''}
                        {motm.runs > 0 && motm.wickets > 0 ? ' · ' : ''}
                        {motm.wickets > 0 ? `${motm.wickets} wickets` : ''}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity style={styles.btnGreen}
                    onPress={() => { setShowInningsModal(false); router.push('/scorecard'); }}>
                    <Text style={styles.btnText}>📋 View Full Scorecard</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.btnGreen, { backgroundColor: '#334155', marginTop: 10 }]}
                    onPress={async () => {
                      setShowInningsModal(false);
                      await saveMatch();
                      router.push('/history');
                    }}>
                    <Text style={styles.btnText}>💾 Save & View History</Text>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      <Text style={styles.title}>🏏 Cricket Scoring</Text>

      {/* ── SCOREBOARD ── */}
      <View style={styles.card}>
        <Text style={styles.score}>{match.runs}/{match.wickets}</Text>
        <Text style={styles.overs}>Overs: {getOvers()} / {match.totalOvers}</Text>
        <Text style={styles.runRate}>CRR: {getRunRate()}{getRequiredRunRate() ? `  |  RRR: ${getRequiredRunRate()}` : ''}</Text>
        {innings === 2 && match.target && (
          <>
            <View style={styles.targetRow}>
              <View style={styles.targetItem}>
                <Text style={styles.targetVal}>{match.target}</Text>
                <Text style={styles.targetLabel}>Target</Text>
              </View>
              <View style={styles.targetDivider} />
              <View style={styles.targetItem}>
                <Text style={[styles.targetVal, { color: '#f59e0b' }]}>
                  {Math.max(0, match.target - match.runs)}
                </Text>
                <Text style={styles.targetLabel}>Runs needed</Text>
              </View>
              <View style={styles.targetDivider} />
              <View style={styles.targetItem}>
                <Text style={[styles.targetVal, {
                  color: parseFloat(getRequiredRunRate()) > parseFloat(getRunRate()) ? '#ef4444' : '#22c55e'
                }]}>
                  {getRequiredRunRate() || '—'}
                </Text>
                <Text style={styles.targetLabel}>Req. RR</Text>
              </View>
              <View style={styles.targetDivider} />
              <View style={styles.targetItem}>
                <Text style={styles.targetVal}>
                  {Math.floor(((match.totalOvers * 6) - match.balls) / 6)}.{((match.totalOvers * 6) - match.balls) % 6}
                </Text>
                <Text style={styles.targetLabel}>Overs left</Text>
              </View>
            </View>
            {getMatchStatus() && (
              <Text style={styles.matchStatusText}>{getMatchStatus()}</Text>
            )}
          </>
        )}
        {innings === 2 && (
          <Text style={{ color: '#64748b', textAlign: 'center', fontSize: 11, marginBottom: 4 }}>
            2nd Innings
          </Text>
        )}
        {match.venue ? <Text style={styles.venueText}>{match.venue}</Text> : null}
        {match.matchDate ? <Text style={styles.venueText}>{match.matchDate}  {match.matchTime}</Text> : null}
        <View style={styles.batterRow}>
          <View style={styles.batterItem}>
            <Text style={styles.batterName}>
              🏏 {match.striker || '—'}
            </Text>
            <Text style={styles.batterStatus}>
              {batsmenStats[match.striker]
                ? `${batsmenStats[match.striker].runs} (${batsmenStats[match.striker].balls}b) · not out *`
                : 'on strike · not out *'}
            </Text>
          </View>
          <View style={[styles.batterItem, { alignItems: 'flex-end' }]}>
            <Text style={styles.batterName}>
              {match.nonStriker || '—'}
            </Text>
            <Text style={styles.batterStatus}>
              {batsmenStats[match.nonStriker]
                ? `${batsmenStats[match.nonStriker].runs} (${batsmenStats[match.nonStriker].balls}b) · not out`
                : 'not out'}
            </Text>
          </View>
        </View>

        <Text style={styles.bowlerText}>Bowling: {match.bowler}</Text>
      </View>

      {/* ── BATTING STATS ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Batting — {match.battingTeam}</Text>
        <View style={styles.tableRow}>
          <Text style={[styles.tableHead, { flex: 2 }]}>Player</Text>
          <Text style={styles.tableHead}>R</Text>
          <Text style={styles.tableHead}>B</Text>
          <Text style={styles.tableHead}>SR</Text>
        </View>
        {Object.keys(batsmenStats).map((p, i) => {
          const isStriker = match.striker === p;
          const isNonStriker = match.nonStriker === p;
          const isOut = !isStriker && !isNonStriker;
          return (
            <View key={i} style={[styles.tableRow, isOut && { opacity: 0.6 }]}>
              <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <Text style={[styles.tableCell, { flex: 0 },
                  isStriker && { color: '#38bdf8', fontWeight: 'bold' },
                  isOut && { color: '#64748b' }
                ]}>
                  {p}{isStriker ? ' *' : ''}
                </Text>
                {isOut && (
                  <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: '600' }}>
                    (out)
                  </Text>
                )}
              </View>
              <Text style={[styles.tableCell,
                isOut && { color: '#64748b' },
                !isOut && batsmenStats[p].runs >= 50 && { color: '#f59e0b', fontWeight: 'bold' }
              ]}>{batsmenStats[p].runs}</Text>
              <Text style={[styles.tableCell, isOut && { color: '#64748b' }]}>{batsmenStats[p].balls}</Text>
              <Text style={[styles.tableCell, isOut && { color: '#64748b' }]}>{strikeRate(p)}</Text>
            </View>
          );
        })}
        {Object.keys(batsmenStats).length === 0 &&
          <Text style={styles.emptyHint}>No runs scored yet</Text>}
      </View>

      {/* ── BOWLING STATS ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Bowling</Text>
        <View style={styles.tableRow}>
          <Text style={[styles.tableHead, { flex: 2 }]}>Bowler</Text>
          <Text style={styles.tableHead}>O</Text>
          <Text style={styles.tableHead}>R</Text>
          <Text style={styles.tableHead}>W</Text>
          <Text style={styles.tableHead}>Eco</Text>
        </View>
        {Object.keys(bowlerStats).map((b, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 2 }, match.bowler === b && { color: '#f59e0b' }]}>
              {b}{match.bowler === b ? ' *' : ''}
            </Text>
            <Text style={styles.tableCell}>{(bowlerStats[b].balls / 6).toFixed(1)}</Text>
            <Text style={styles.tableCell}>{bowlerStats[b].runs}</Text>
            <Text style={styles.tableCell}>{bowlerStats[b].wickets}</Text>
            <Text style={styles.tableCell}>{economy(b)}</Text>
          </View>
        ))}
        {Object.keys(bowlerStats).length === 0 &&
          <Text style={styles.emptyHint}>No balls bowled yet</Text>}
      </View>

      {/* ── PLAYER SELECT ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Select Players</Text>
        <Text style={styles.label}>Striker (batting)</Text>
        <Picker selectedValue={match.striker}
          onValueChange={val => setMatch(prev => ({ ...prev, striker: val }))}
          style={{ color: '#fff' }}>
          {match.players.map((p, i) => <Picker.Item key={i} label={p} value={p} />)}
        </Picker>
        <Text style={styles.label}>Non-Striker (batting)</Text>
        <Picker selectedValue={match.nonStriker}
          onValueChange={val => setMatch(prev => ({ ...prev, nonStriker: val }))}
          style={{ color: '#fff' }}>
          {match.players.map((p, i) => <Picker.Item key={i} label={p} value={p} />)}
        </Picker>
        <Text style={styles.label}>Bowler (bowling team)</Text>
        <Picker selectedValue={match.bowler}
          onValueChange={val => setMatch(prev => ({ ...prev, bowler: val }))}
          style={{ color: '#fff' }}>
          {(match.bowlingPlayers || match.players).map((p, i) => (
            <Picker.Item key={i} label={p} value={p} />
          ))}
        </Picker>
      </View>

      {/* ── ADD PLAYER ── */}
      <TextInput
        placeholder="Add extra player to batting team"
        placeholderTextColor="#94a3b8"
        value={newPlayer}
        onChangeText={setNewPlayer}
        style={styles.input}
      />
      <TouchableOpacity style={styles.btnBlue} onPress={addPlayer}>
        <Text style={styles.btnText}>Add Player</Text>
      </TouchableOpacity>

      {/* ── SCORING CONTROLS ── */}
      <Text style={styles.sectionTitle}>Score Ball</Text>

      <View style={styles.row}>
        {[1, 2, 3, 4, 6].map(r => (
          <TouchableOpacity
            key={r}
            style={[
              styles.btn,
              r === 2 && styles.btnTwo,
              r === 4 && styles.btnFour,
              r === 6 && styles.btnSix,
            ]}
            onPress={() => addBall('run', r)}>
            <Text style={styles.btnText}>{r}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.row}>
        <TouchableOpacity style={styles.btn} onPress={() => addBall('dot')}>
          <Text style={styles.btnText}>Dot</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnRed]} onPress={() => addBall('wicket')}>
          <Text style={styles.btnText}>Wicket</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnUndo]} onPress={undoLastBall}>
          <Text style={styles.btnText}>Undo</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <TouchableOpacity style={styles.btnSmall} onPress={() => addBall('wide')}>
          <Text style={styles.btnText}>Wide</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSmall} onPress={() => addBall('wideRun', 2)}>
          <Text style={styles.btnText}>Wide+2</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSmall} onPress={() => addBall('wideBoundary')}>
          <Text style={styles.btnText}>Wide 4</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSmall} onPress={() => addBall('noBall')}>
          <Text style={styles.btnText}>No Ball</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.row}>
        <TouchableOpacity style={styles.btnSmall} onPress={() => addBall('bye', 1)}>
          <Text style={styles.btnText}>Bye 1</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnSmall} onPress={() => addBall('bye', 4)}>
          <Text style={styles.btnText}>Bye 4</Text>
        </TouchableOpacity>
      </View>

      {/* ── OVER-BY-OVER LOG ── */}
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Over Log</Text>
        {Object.keys(overLog).length === 0 && (
          <Text style={styles.emptyHint}>No balls bowled yet.</Text>
        )}
        {Object.keys(overLog).sort((a, b) => Number(b) - Number(a)).map(overNum => (
          <View key={overNum} style={styles.overRow}>
            <Text style={styles.overLabel}>Over {overNum}</Text>
            <View style={styles.overBalls}>
              {overLog[overNum].map(b => (
                <View key={b.id} style={[
                  styles.ballBubble,
                  b.type === 'wicket' && { backgroundColor: '#ef4444' },
                  (b.type === 'wide' || b.type === 'noBall') && { backgroundColor: '#f59e0b' },
                  (b.run === 4 || b.run === 6) && { backgroundColor: '#22c55e' },
                ]}>
                  <Text style={styles.ballBubbleText}>{b.text}</Text>
                </View>
              ))}
            </View>
          </View>
        ))}
      </View>

      {/* ── Row 1: Save Match ── */}
      <TouchableOpacity style={[styles.btnGreen, { marginTop: 10 }]} onPress={saveMatch}>
        <Text style={styles.btnText}>💾 Save Match</Text>
      </TouchableOpacity>

      {/* ── Row 2: Navigation buttons ── */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <TouchableOpacity
          style={[styles.navBtn, { backgroundColor: '#334155' }]}
          onPress={() => router.push('/history')}>
          <Text style={styles.navBtnText}>📋 History</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navBtn, { backgroundColor: '#1e3a5f' }]}
          onPress={() => router.push('/charts')}>
          <Text style={styles.navBtnText}>📊 Charts</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navBtn, { backgroundColor: '#1a3a2a' }]}
          onPress={() => router.push('/scorecard')}>
          <Text style={styles.navBtnText}>📄 Scorecard</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navBtn, { backgroundColor: '#1d4ed8' }]}
          onPress={() => router.push('/players')}>
          <Text style={styles.navBtnText}>👤 Players</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.navBtn, { backgroundColor: '#0f766e' }]}
          onPress={() => router.push('/schedule')}>
          <Text style={styles.navBtnText}>📅 Schedule</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  title: { fontSize: 24, color: '#fff', textAlign: 'center', marginBottom: 20, fontWeight: 'bold' },

  card: { backgroundColor: '#1e293b', padding: 15, borderRadius: 15, marginBottom: 14 },
  score: { fontSize: 48, color: '#38bdf8', textAlign: 'center', fontWeight: 'bold' },
  overs: { color: '#94a3b8', textAlign: 'center', fontSize: 15, marginBottom: 4 },
  runRate: { color: '#22c55e', textAlign: 'center', fontSize: 13, marginBottom: 6 },
  targetRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 10, padding: 10, marginBottom: 6 },
  targetItem: { alignItems: 'center', flex: 1 },
  targetVal: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  targetLabel: { color: '#64748b', fontSize: 10, marginTop: 2 },
  targetDivider: { width: 0.5, height: 30, backgroundColor: '#334155' },
  matchStatusText: { color: '#94a3b8', textAlign: 'center', fontSize: 12, marginBottom: 6 },
  venueText: { color: '#475569', textAlign: 'center', fontSize: 12, marginBottom: 2 },
  batterRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  batterText: { color: '#e2e8f0', fontSize: 13 },
  batterItem: { flex: 1 },
  batterName: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  batterStatus: { color: '#22c55e', fontSize: 11, marginTop: 2 },
  dismissedRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderTopWidth: 0.5, borderTopColor: '#334155', marginTop: 4 },
  dismissedName: { color: '#64748b', fontSize: 12 },
  dismissedScore: { color: '#ef4444', fontSize: 12 },
  bowlerText: { color: '#f59e0b', fontSize: 13, marginTop: 4 },

  sectionTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 8 },
  label: { color: '#94a3b8', marginTop: 8, fontSize: 13 },
  emptyHint: { color: '#475569', fontSize: 13, paddingVertical: 4 },

  tableRow: { flexDirection: 'row', paddingVertical: 4 },
  tableHead: { flex: 1, color: '#94a3b8', fontSize: 12, fontWeight: 'bold' },
  tableCell: { flex: 1, color: '#e2e8f0', fontSize: 13 },

  input: {
    backgroundColor: '#1e293b', color: '#fff',
    padding: 12, borderRadius: 10, marginBottom: 10,
    borderWidth: 0.5, borderColor: '#334155'
  },

  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6, gap: 6 },

  btn: {
    backgroundColor: '#38bdf8', paddingVertical: 14, paddingHorizontal: 8,
    borderRadius: 10, flex: 1, alignItems: 'center'
  },
  btnSmall: {
    backgroundColor: '#334155', paddingVertical: 12, paddingHorizontal: 6,
    borderRadius: 10, flex: 1, alignItems: 'center'
  },
  btnTwo: { backgroundColor: '#0ea5e9' },
  navBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
  },
  navBtnText: { color: '#fff', fontWeight: '600', fontSize: 11, textAlign: 'center' },
  btnFour: { backgroundColor: '#22c55e' },
  btnSix: { backgroundColor: '#a855f7' },
  btnRed: { backgroundColor: '#ef4444' },
  btnUndo: { backgroundColor: '#64748b' },
  btnBlue: {
    backgroundColor: '#38bdf8', padding: 12, borderRadius: 10,
    alignItems: 'center', marginBottom: 14
  },
  btnGreen: {
    backgroundColor: '#22c55e', padding: 15, borderRadius: 10,
    alignItems: 'center', marginTop: 6
  },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  overRow: { marginBottom: 10 },
  overLabel: { color: '#94a3b8', fontSize: 12, marginBottom: 4 },
  overBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  ballBubble: {
    backgroundColor: '#334155', borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4
  },
  ballBubbleText: { color: '#fff', fontSize: 11 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center'
  },
  modalCard: {
    backgroundColor: '#1e293b', borderRadius: 16,
    padding: 20, width: '85%'
  },
  modalTitle: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 12 },
});