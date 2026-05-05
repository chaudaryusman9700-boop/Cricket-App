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
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

export default function HomeScreen({ route, navigation }) {

  // ── Read data passed from SetupScreen ──
  const setup = route?.params?.matchSetup;

  const battingPlayers = setup?.battingPlayers || ["Usman", "Ali", "Ahmed", "Bilal", "Hassan"];
  const bowlingPlayers = setup?.bowlingPlayers || ["Zahid", "Imran", "Saad"];

  // 🧠 MAIN MATCH STATE
  const [match, setMatch] = useState({
    runs: 0,
    wickets: 0,
    balls: 0,
    totalOvers: setup?.totalOvers || 10,
    battingTeam: setup?.battingTeam || 'Team A',
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
  });

  const [batsmenStats, setBatsmenStats] = useState({});
  const [bowlerStats, setBowlerStats] = useState({});
  const [newPlayer, setNewPlayer] = useState('');
  const [showNewBatsmanModal, setShowNewBatsmanModal] = useState(false);
  const [selectedNewBatsman, setSelectedNewBatsman] = useState('');

  useEffect(() => {
    // Only load saved match if no setup was passed from SetupScreen
    if (!setup) loadMatch();
  }, []);

  // ─── SAVE / LOAD ────────────────────────────────────────────────
  const saveMatch = async () => {
    try {
      await AsyncStorage.setItem('currentMatch', JSON.stringify({ match, batsmenStats, bowlerStats }));
      Alert.alert('Saved', 'Match saved successfully ✅');
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

    // ── INNINGS COMPLETE ──
    if (updated.balls >= updated.totalOvers * 6) {
      Alert.alert(
        'Innings Complete!',
        `${updated.battingTeam} scored ${updated.runs}/${updated.wickets} in ${updated.totalOvers} overs.`
      );
    }

    setBatsmenStats(newBatsmenStats);
    setBowlerStats(newBowlerStats);

    if (type === 'wicket') {
      setMatch(updated);
      const avail = updated.players.filter(
        p => p !== updated.nonStriker && p !== updated.bowler
      );
      setSelectedNewBatsman(avail[0] || '');
      setShowNewBatsmanModal(true);
    } else {
      setMatch(updated);
    }
  };

  // ── After wicket: confirm new batsman ──
  const confirmNewBatsman = () => {
    if (!selectedNewBatsman) return;
    Alert.alert(
      'New Batsman',
      `${selectedNewBatsman} is coming in to bat.`,
      [{
        text: 'OK', onPress: () => {
          setMatch(prev => ({ ...prev, striker: selectedNewBatsman }));
          setShowNewBatsmanModal(false);
        }
      }]
    );
  };

  // ─── HELPERS ────────────────────────────────────────────────────
  const getOvers = () => `${Math.floor(match.balls / 6)}.${match.balls % 6}`;

  const getRunRate = () => {
    if (match.balls === 0) return '0.00';
    return (match.runs / (match.balls / 6)).toFixed(2);
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
    <ScrollView style={styles.container}>

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

      <Text style={styles.title}>🏏 Cricket Scoring</Text>

      {/* ── SCOREBOARD ── */}
      <View style={styles.card}>
        <Text style={styles.score}>{match.runs}/{match.wickets}</Text>
        <Text style={styles.overs}>Overs: {getOvers()} / {match.totalOvers}</Text>
        <Text style={styles.runRate}>Run Rate: {getRunRate()}</Text>
        {match.venue ? <Text style={styles.venueText}>{match.venue}</Text> : null}
        {match.matchDate ? <Text style={styles.venueText}>{match.matchDate}  {match.matchTime}</Text> : null}
        <View style={styles.batterRow}>
          <Text style={styles.batterText}>* {match.striker || '—'} (on strike)</Text>
          <Text style={styles.batterText}>{match.nonStriker || '—'}</Text>
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
        {Object.keys(batsmenStats).map((p, i) => (
          <View key={i} style={styles.tableRow}>
            <Text style={[styles.tableCell, { flex: 2 }, match.striker === p && { color: '#38bdf8' }]}>
              {p}{match.striker === p ? ' *' : ''}
            </Text>
            <Text style={styles.tableCell}>{batsmenStats[p].runs}</Text>
            <Text style={styles.tableCell}>{batsmenStats[p].balls}</Text>
            <Text style={styles.tableCell}>{strikeRate(p)}</Text>
          </View>
        ))}
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
            style={[styles.btn, r === 4 && styles.btnFour, r === 6 && styles.btnSix]}
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

      <TouchableOpacity style={styles.btnGreen} onPress={saveMatch}>
        <Text style={styles.btnText}>Save Match</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  title: { fontSize: 24, color: '#fff', textAlign: 'center', marginBottom: 20, fontWeight: 'bold' },

  card: { backgroundColor: '#1e293b', padding: 15, borderRadius: 15, marginBottom: 14 },
  score: { fontSize: 48, color: '#38bdf8', textAlign: 'center', fontWeight: 'bold' },
  overs: { color: '#94a3b8', textAlign: 'center', fontSize: 15, marginBottom: 4 },
  runRate: { color: '#22c55e', textAlign: 'center', fontSize: 13, marginBottom: 4 },
  venueText: { color: '#475569', textAlign: 'center', fontSize: 12, marginBottom: 2 },
  batterRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  batterText: { color: '#e2e8f0', fontSize: 13 },
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
