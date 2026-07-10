import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
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
  const [newBowlerName, setNewBowlerName] = useState('');
  // ── Batting ──
  const [showNewBatsmanModal, setShowNewBatsmanModal] = useState(false);
  const [selectedNewBatsman, setSelectedNewBatsman] = useState('');
  const [dismissedBatsmen, setDismissedBatsmen] = useState([]);
  const [retiredHurtBatsmen, setRetiredHurtBatsmen] = useState([]);
  const [showRetiredHurtModal, setShowRetiredHurtModal] = useState(false);
  // ── Bowling ──
  const [showBowlerModal, setShowBowlerModal] = useState(false);
  const [selectedNewBowler, setSelectedNewBowler] = useState('');
  const [bowlerTypes, setBowlerTypes] = useState({});
  const [selectedBowlerType, setSelectedBowlerType] = useState('Fast');
  const [showBowlerTypeModal, setShowBowlerTypeModal] = useState(false);
  const [pendingBowlerName, setPendingBowlerName] = useState('');
  // ── Extras ──
  // ── Voice Commentary ──
  const [voiceOn, setVoiceOn] = useState(false);
  const [voiceLang, setVoiceLang] = useState('en'); // 'en' or 'ur'
  // ── 🎙️ Voice Commentary ──
  const [commentaryLang, setCommentaryLang] = useState('en'); // 'en' or 'ur'
  const [showWides, setShowWides] = useState(false);
  // ── 🎙️ Voice Commentary ──
  const [commentaryOn, setCommentaryOn] = useState(false);
  const [showNoBalls, setShowNoBalls] = useState(false);
  const [showByes, setShowByes] = useState(false);
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
      // Don't remove matchResult here — scorecard needs it
      // It gets overwritten when next match ends
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
      Alert.alert('Saved ✅', 'Match saved to history!');
    } catch {
      Alert.alert('Error', 'Save failed ❌');
    }
  };

  // ── 🎙️ Voice Commentary ──
  const speakPair = (textEn, textUr) => {
    if (!commentaryOn) return;
    Speech.stop();
    const text = commentaryLang === 'ur' ? (textUr || textEn) : textEn;
    Speech.speak(text, {
      language: commentaryLang === 'ur' ? 'ur-PK' : 'en-IN',
      pitch: 1.0,
      rate: commentaryLang === 'ur' ? 0.85 : 0.95,
    });
  };

  // ── Commentary messages per ball type ──
  const getCommentaryLegacy2 = (type, run, updated) => {
    const batter = updated.striker || 'Batsman';
    const bowler = updated.bowler || 'Bowler';
    const score = `${updated.runs} for ${updated.wickets}`;
    const oversDone = `${Math.floor(updated.balls / 6)} point ${updated.balls % 6}`;

    if (type === 'run') {
      if (run === 6) return {
        en: `Six! Magnificent shot by ${batter}! That's a maximum!`,
        ur: `چھکا! ${batter} کا شاندار شاٹ! یہ چھ رنز ہیں!`
      };
      if (run === 4) return {
        en: `Four! Beautiful boundary by ${batter}!`,
        ur: `چار! ${batter} کی خوبصورت باؤنڈری!`
      };
      if (run === 3) return {
        en: `Three runs! Good running between the wickets!`,
        ur: `تین رنز! وکٹوں کے درمیان اچھی دوڑ!`
      };
      if (run === 2) return {
        en: `Two runs! ${batter} pushes it through the gap.`,
        ur: `دو رنز! ${batter} نے گیپ میں شاٹ لگایا۔`
      };
      if (run === 1) return {
        en: `One run, ${batter} rotates the strike.`,
        ur: `ایک رن، ${batter} نے اسٹرائک گھمائی۔`
      };
    }
    if (type === 'dot') return {
      en: `Dot ball! Excellent delivery from ${bowler}!`,
      ur: `ڈاٹ بال! ${bowler} کی شاندار گیند!`
    };
    if (type === 'wicket') return {
      en: `Wicket! ${batter} is out! ${bowler} gets the breakthrough! Score is ${score}.`,
      ur: `وکٹ! ${batter} آؤٹ ہو گئے! ${bowler} نے کامیابی حاصل کی! اسکور ${score} ہے۔`
    };
    if (type === 'wide') return {
      en: `Wide ball! Extra run for the batting side.`,
      ur: `وائیڈ بال! بیٹنگ سائیڈ کو ایک اضافی رن!`
    };
    if (type === 'noBall') return {
      en: `No ball! Free hit coming up!`,
      ur: `نو بال! فری ہٹ آ رہی ہے!`
    };
    if (type === 'noBallRun') return {
      en: `No ball and ${run} runs! Expensive delivery from ${bowler}!`,
      ur: `نو بال اور ${run} رنز! ${bowler} کی مہنگی گیند!`
    };
    if (type === 'bye') return {
      en: `${run} bye${run > 1 ? 's' : ''}! Gets past the keeper.`,
      ur: `${run} بائی! وکٹ کیپر سے آگے نکل گئی!`
    };
    if (type === 'wideRun') return {
      en: `Wide and ${run} run${run > 1 ? 's' : ''}! Costly delivery!`,
      ur: `وائیڈ اور ${run} رنز! مہنگی گیند!`
    };
    return null;
  };

  // ── End of over commentary ──
  const speakEndOfOver = (updated) => {
    if (!commentaryOn) return;
    const overNum = Math.floor(updated.balls / 6);
    const score = `${updated.runs} for ${updated.wickets}`;
    const oversLeft = updated.totalOvers - overNum;
    const textEn = `End of over ${overNum}! Score is ${score}. ${oversLeft} over${oversLeft !== 1 ? 's' : ''} remaining.`;
    const textUr = `اوور ${overNum} ختم! اسکور ${score} ہے۔ ${oversLeft} اوور باقی ہیں۔`;
    speak(textEn, textUr);
  };

  // ── Auto save silently when match ends ──
  const autoSaveMatch = async (matchData, bStats, bwStats) => {
    try {
      const key = 'match_' + Date.now();
      const payload = JSON.stringify({
        match: matchData,
        batsmenStats: bStats,
        bowlerStats: bwStats,
        savedAt: Date.now(),
        autoSaved: true,
      });
      await AsyncStorage.setItem(key, payload);
      await AsyncStorage.setItem('currentMatch', payload);
      console.log('Match auto-saved ✅');
    } catch (e) {
      console.log('Auto-save failed:', e);
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
  // ── 🎙️ Voice Commentary ──
  const speakLegacy = (enText, urText) => {
    if (!commentaryOn) return;
    const text = commentaryLang === 'ur' ? urText : enText;
    Speech.stop();
    Speech.speak(text, {
      language: commentaryLang === 'ur' ? 'ur-PK' : 'en-IN',
      pitch: 1.1,
      rate: 0.95,
    });
  };

  const getCommentaryLegacy = (type, run, updated) => {
    const striker = updated?.striker || match.striker || 'Batsman';
    const bowler = updated?.bowler || match.bowler || 'Bowler';

    if (type === 'run') {
      if (run === 6) speak(`Six! What a shot by ${striker}! Magnificent!`, `Chha! Kya zabardast shot hai ${striker} ka!`);
      else if (run === 4) speak(`Four! Beautiful boundary by ${striker}!`, `Chaar! Khubsoorat boundary ${striker} ki taraf se!`);
      else if (run === 3) speak(`Three runs! Well run!`, `Teen runs! Achi running!`);
      else if (run === 2) speak(`Two runs taken.`, `Do runs liye gaye.`);
      else if (run === 1) speak(`One run.`, `Ek run.`);
    } else if (type === 'dot') {
      speak(`Dot ball. Good delivery from ${bowler}.`, `Dot ball. ${bowler} ki achi ball.`);
    } else if (type === 'wicket') {
      speak(
        `Wicket! ${striker} is out! Great bowling by ${bowler}!`,
        `Wicket! ${striker} out ho gaya! ${bowler} ki zabardast bowling!`
      );
    } else if (type === 'wide') {
      speak(`Wide ball! Extra run.`, `Wide ball! Ek extra run.`);
    } else if (type === 'noBall') {
      speak(`No ball! Free hit next delivery!`, `No ball! Agla ball free hit hai!`);
    } else if (type === 'bye') {
      speak(`Bye! ${run} run${run > 1 ? 's' : ''}.`, `Bye! ${run} run.`);
    }
    // End of over
    if (updated && updated.balls > 0 && updated.balls % 6 === 0) {
      const overNum = Math.floor(updated.balls / 6);
      setTimeout(() => speak(
        `End of over ${overNum}. Score: ${updated.runs} for ${updated.wickets}.`,
        `Over ${overNum} khatam. Score: ${updated.runs} runs, ${updated.wickets} wickets.`
      ), 1500);
    }
    // Exciting finish
    if (updated && match.target) {
      const needed = match.target - updated.runs;
      const ballsLeft = (updated.totalOvers * 6) - updated.balls;
      if (needed > 0 && needed <= 10 && ballsLeft <= 12) {
        setTimeout(() => speak(
          `${needed} needed off ${ballsLeft} balls! What a finish!`,
          `${needed} runs chahiye ${ballsLeft} balls mein! Kamal ka muqabala!`
        ), 2000);
      }
    }
  };

  const addPlayer = (team = 'batting') => {
    const name = newPlayer.trim();
    if (!name) return;
    if (team === 'batting') {
      if (match.players.includes(name)) {
        Alert.alert('Duplicate', `${name} is already in batting team.`); return;
      }
      setMatch(prev => ({ ...prev, players: [...prev.players, name] }));
      setNewPlayer('');
    } else {
      if ((match.bowlingPlayers || []).includes(name)) {
        Alert.alert('Duplicate', `${name} is already in bowling team.`); return;
      }
      // Ask bowler type before adding
      setPendingBowlerName(name);
      setShowBowlerTypeModal(true);
    }
  };

  const confirmBowlerType = (type) => {
    const name = pendingBowlerName;
    setBowlerTypes(prev => ({ ...prev, [name]: type }));
    setMatch(prev => ({
      ...prev,
      bowlingPlayers: [...(prev.bowlingPlayers || []), name],
    }));
    setNewPlayer('');
    setShowBowlerTypeModal(false);
    setPendingBowlerName('');
  };



  const getCommentaryLegacy3 = (type, run, updated) => {
    const batsman = updated.striker || 'Batsman';
    const bowler = updated.bowler || 'Bowler';
    const score = `${updated.runs} for ${updated.wickets}`;
    const scoreUr = `${updated.runs} رنز ${updated.wickets} وکٹ`;

    if (type === 'run') {
      if (run === 6) return [
        `SIX! What a shot by ${batsman}! That's gone all the way!`,
        `چھکا! ${batsman} کا زبردست شاٹ! گیند باؤنڈری سے باہر!`
      ];
      if (run === 4) return [
        `FOUR! Magnificent stroke by ${batsman}! Ball races to the boundary!`,
        `چوکا! ${batsman} کا خوبصورت شاٹ! باؤنڈری!`
      ];
      if (run === 3) return [
        `Three runs! Good running between the wickets!`,
        `تین رنز! اچھی دوڑ!`
      ];
      if (run === 2) return [
        `Two runs! Good placement by ${batsman}!`,
        `دو رنز! ${batsman} کا اچھا شاٹ!`
      ];
      if (run === 1) return [
        `One run, good rotation of strike!`,
        `ایک رن!`
      ];
    }
    if (type === 'dot') return [
      `Dot ball! Excellent delivery from ${bowler}! No run!`,
      `ڈاٹ بال! ${bowler} کی شاندار گیند! کوئی رن نہیں!`
    ];
    if (type === 'wicket') return [
      `WICKET! ${batsman} is OUT! ${bowler} strikes! Score is ${score}!`,
      `وکٹ! ${batsman} آؤٹ! ${bowler} نے وکٹ لی! اسکور ${scoreUr}!`
    ];
    if (type === 'wide') return [
      `Wide ball! Extra run to the batting team!`,
      `وائیڈ گیند! ایک اضافی رن!`
    ];
    if (type === 'noBall') return [
      `No ball! Free hit on the next delivery!`,
      `نو بال! اگلی گیند فری ہٹ ہوگی!`
    ];
    if (type === 'bye') return [
      `${run} bye! The ball gets past the keeper!`,
      `${run} بائی رنز!`
    ];
    return ['', ''];
  };

  const getOverEndCommentary = (updated) => {
    const overNum = Math.floor(updated.balls / 6);
    const score = `${updated.runs} for ${updated.wickets}`;
    const scoreUr = `${updated.runs} رنز ${updated.wickets} وکٹ`;
    return [
      `End of over ${overNum}! Score is ${score}! Run rate: ${(updated.runs / (updated.balls / 6)).toFixed(2)}!`,
      `اوور ${overNum} ختم! اسکور ${scoreUr}! رن ریٹ ${(updated.runs / (updated.balls / 6)).toFixed(2)}!`
    ];
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
  // ── Voice Commentary ──
  const speak = (text) => {
    if (!commentaryOn) return;
    Speech.stop();
    Speech.speak(text, {
      language: commentaryLang === 'ur' ? 'ur-PK' : 'en-IN',
      pitch: 1.0,
      rate: commentaryLang === 'ur' ? 0.85 : 0.95,
    });
  };

  const getCommentaryText = (type, run, updated) => {
    const batsman = updated.striker || 'Batsman';
    const bowler = updated.bowler || 'Bowler';
    const score = `${updated.runs} for ${updated.wickets}`;
    const isUrdu = commentaryLang === 'ur';

    if (type === 'run') {
      if (run === 1) return isUrdu ? `ایک رن! ${batsman}` : `1 run to ${batsman}`;
      if (run === 2) return isUrdu ? `دو رن! ${batsman}` : `2 runs! Good cricket by ${batsman}`;
      if (run === 3) return isUrdu ? `تین رن! شاندار دوڑ` : `3 runs! Excellent running`;
      if (run === 4) return isUrdu ? `چوکا! ${batsman} کا شاندار شاٹ!` : `FOUR! Beautiful shot by ${batsman}!`;
      if (run === 6) return isUrdu ? `چھکا! ${batsman} نے میدان کے باہر بھیج دیا!` : `SIX! ${batsman} hits it out of the park!`;
    }
    if (type === 'dot') return isUrdu ? `ڈاٹ بال۔ ${bowler} کی اچھی گیند` : `Dot ball. Good delivery by ${bowler}`;
    if (type === 'wicket') return isUrdu ? `آؤٹ! ${batsman} کو ${bowler} نے آؤٹ کر دیا! سکور ${score}` : `WICKET! ${batsman} is OUT! ${bowler} strikes! Score is ${score}`;
    if (type === 'wide') return isUrdu ? `وائیڈ بال! ایک اضافی رن` : `Wide ball! 1 extra run`;
    if (type === 'wideRun') return isUrdu ? `وائیڈ اور ${run} رن!` : `Wide and ${run} runs!`;
    if (type === 'noBall') return isUrdu ? `نو بال! فری ہٹ آ رہی ہے!` : `No ball! FREE HIT on the next delivery!`;
    if (type === 'noBallRun') return isUrdu ? `نو بال اور ${run} رن! فری ہٹ!` : `No ball and ${run} runs! Free hit next!`;
    if (type === 'bye') return isUrdu ? `${run} بائی رن` : `${run} bye${run > 1 ? 's' : ''}`;
    return '';
  };

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
      const wideTotal = 1 + run;
      updated.runs += wideTotal;
      updated.extras = (updated.extras || 0) + wideTotal;
      newBowlerStats[updated.bowler].runs += wideTotal;
      ballEvent.text = run === 0 ? 'Wide' : `Wide +${run} (${wideTotal})`;
      // swap striker if odd runs scored
      if (run % 2 !== 0)
        [updated.striker, updated.nonStriker] = [updated.nonStriker, updated.striker];
    }

    else if (type === 'wideBoundary') {
      updated.runs += 5;
      newBowlerStats[updated.bowler].runs += 5;
      ballEvent.text = 'Wide Boundary (5)';
    }

    else if (type === 'noBall') {
      // NB = 1 penalty run, no runs scored, not a legal delivery
      updated.runs += 1;
      updated.extras = (updated.extras || 0) + 1;
      newBowlerStats[updated.bowler].runs += 1;
      ballEvent.text = 'No Ball';
      updated.freeHit = true; // next ball is free hit
    }

    else if (type === 'noBallRun') {
      // NB + runs scored: total = 1 penalty + runs
      const total = 1 + run;
      updated.runs += total;
      updated.extras = (updated.extras || 0) + 1; // only penalty is extra
      newBowlerStats[updated.bowler].runs += total;
      // swap striker on odd runs
      if (run % 2 !== 0)
        [updated.striker, updated.nonStriker] = [updated.nonStriker, updated.striker];
      ballEvent.text = `NB+${run} (${total})`;
      updated.freeHit = true; // next ball is free hit
    }

    else if (type === 'bye') {
      updated.runs += run;
      updated.extras = (updated.extras || 0) + run;
      updated.balls += 1;
      ballEvent.text = `Bye ${run}`;
      // swap striker on odd runs
      if (run % 2 !== 0)
        [updated.striker, updated.nonStriker] = [updated.nonStriker, updated.striker];
    }

    updated.snapshots = [...(match.snapshots || []), snapshot];
    updated.ballHistory = [ballEvent, ...(updated.ballHistory || [])];

    // ── END OF OVER ──
    const isLegalBall = ['run', 'dot', 'wicket', 'bye'].includes(type);
    // Clear free hit after legal delivery
    if (isLegalBall) updated.freeHit = false;
    if (isLegalBall && updated.balls % 6 === 0 && updated.balls > 0) {
      // ── End of over: swap striker + show bowler change modal ──
      [updated.striker, updated.nonStriker] = [updated.nonStriker, updated.striker];
      const overNum2 = Math.floor(updated.balls / 6);
      const overScore = `${updated.runs} for ${updated.wickets}`;
      speak(commentaryLang === 'ur'
        ? `اوور ${overNum2} مکمل! سکور ${overScore} ہے۔ نیا بولر آ رہا ہے`
        : `End of over ${overNum2}! Score is ${overScore}. New bowler coming in.`
      );
      const overNum = Math.floor(updated.balls / 6);
      const maxOversPerBowler = Math.floor(updated.totalOvers / 5) || 1;

      // Check if current bowler has hit their limit
      const currentBowlerBalls = (newBowlerStats[updated.bowler]?.balls || 0);
      const currentBowlerOvers = Math.floor(currentBowlerBalls / 6);
      const bowlerAtLimit = currentBowlerOvers >= maxOversPerBowler;

      // Filter available bowlers — not same bowler + not at limit
      const availBowlers = (updated.bowlingPlayers || []).filter(p => {
        if (p === updated.bowler) return false; // can't bowl consecutive
        const bowlerBalls = newBowlerStats[p]?.balls || 0;
        const bowlerOvers = Math.floor(bowlerBalls / 6);
        return bowlerOvers < maxOversPerBowler;
      });

      setSelectedNewBowler(availBowlers[0] || '');
      setShowBowlerModal(true);

      if (bowlerAtLimit) {
        Alert.alert(
          '⚠️ Bowler Limit Reached',
          `${updated.bowler} has completed their ${maxOversPerBowler} over quota!`,
          [{ text: 'OK' }]
        );
      }
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

    // ── 🎙️ Voice Commentary ──
    speak(getCommentaryText(type, run, updated));

    // ── Check if match is over after every ball ──
    if (checkMatchResult(updated)) return;

    if (type === 'wicket') {
      // Track who just got out
      const justOut = updated.striker;
      const newDismissed = [...dismissedBatsmen, justOut];
      setDismissedBatsmen(newDismissed);

      // Don't show new batsman modal if innings is already over
      const allOut = updated.wickets >= updated.players.length - 1;
      const oversComplete = updated.balls >= updated.totalOvers * 6;
      if (!allOut && !oversComplete) {
        // Exclude: non-striker, bowler, and ALL previously dismissed batsmen
        const avail = updated.players.filter(
          p => p !== updated.nonStriker &&
               p !== updated.bowler &&
               !newDismissed.includes(p)
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

  // ── Confirm new bowler at end of over ──
  const confirmNewBowler = () => {
    if (!selectedNewBowler) {
      Alert.alert('Select Bowler', 'Please select the bowler for this over.');
      return;
    }
    // Check max overs per bowler (1/5 of total overs, min 1)
    const maxOvers = Math.max(Math.floor(match.totalOvers / 5), 1);
    const bowlerBalls = bowlerStats[selectedNewBowler]?.balls || 0;
    const bowlerFullOvers = Math.floor(bowlerBalls / 6);
    if (bowlerFullOvers >= maxOvers) {
      Alert.alert(
        '⛔ Over Limit Reached',
        `${selectedNewBowler} has already bowled ${bowlerFullOvers} overs. Max is ${maxOvers} overs. Please select another bowler.`
      );
      return;
    }
    // Save bowler type for AI coaching reference
    setBowlerTypes(prev => ({ ...prev, [selectedNewBowler]: selectedBowlerType }));
    setMatch(prev => ({ ...prev, bowler: selectedNewBowler }));
    setShowBowlerModal(false);
  };

  // ── Retired Hurt — batsman leaves but is NOT out ──
  const retireHurt = (playerName) => {
    Alert.alert(
      '🏥 Retired Hurt',
      `${playerName} is retiring hurt. They can come back to bat later.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            setRetiredHurtBatsmen(prev => [...prev, playerName]);
            // Treat like a wicket for batsman replacement, but NOT counted as out
            const avail = match.players.filter(
              p => p !== match.nonStriker &&
                   p !== match.bowler &&
                   !dismissedBatsmen.includes(p) &&
                   !retiredHurtBatsmen.includes(p) &&
                   p !== playerName
            );
            setSelectedNewBatsman(avail[0] || '');
            setMatch(prev => ({ ...prev, striker: avail[0] || '' }));
            setShowNewBatsmanModal(true);
            setShowRetiredHurtModal(false);
          }
        }
      ]
    );
  };

  // ── Retired hurt batsman comes back ──
  const returnFromRetiredHurt = (playerName) => {
    Alert.alert(
      '🏏 Return from Retired Hurt',
      `${playerName} is coming back to bat.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          onPress: () => {
            setRetiredHurtBatsmen(prev => prev.filter(p => p !== playerName));
            setMatch(prev => ({ ...prev, striker: playerName }));
          }
        }
      ]
    );
  };

  // ── Start second innings ──
  const startSecondInnings = () => {
    setDismissedBatsmen([]); // reset for 2nd innings
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
    // ── Auto save match when it ends ──
    autoSaveMatch(
      { ...updated, matchResult: resultData },
      batsmenStats,
      bowlerStats
    );
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
        [{ text: 'View Scorecard', onPress: () => router.push({
          pathname: '/scorecard',
          params: { resultData: JSON.stringify(resultData) }
        }) }]
      );
      return true;
    }

    // ── 2nd innings ended (all out or overs done) ──
    if (allOut || oversComplete) {
      const runsShort = target - 1 - updated.runs; // runs short of target

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
          [{ text: 'View Scorecard', onPress: () => router.push({
            pathname: '/scorecard',
            params: { resultData: JSON.stringify(resultData) }
          }) }]
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
        [{ text: 'View Scorecard', onPress: () => router.push({
          pathname: '/scorecard',
          params: { resultData: JSON.stringify(resultData) }
        }) }]
      );
      return true;
    }
    return false;
  };

  // ─── HELPERS ────────────────────────────────────────────────────
  const getOvers = () => `${Math.floor(match.balls / 6)}.${match.balls % 6}`;
  // Format bowler overs correctly: 8 balls = 1.2 overs (1 full over + 2 balls)
  const getBowlerOvers = (balls) => {
    if (!balls || balls === 0) return '0.0';
    const fullOvers = Math.floor(balls / 6);
    const remBalls = balls % 6;
    // Show X.0 for complete overs, X.1-X.5 for partial
    return remBalls === 0 ? `${fullOvers}.0` : `${fullOvers}.${remBalls}`;
  };

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
      style={{ flex: 1, backgroundColor: '#1a1008' }}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      enabled={Platform.OS === 'ios'}
    >
    <ScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      keyboardDismissMode="on-drag"
    >

      {/* ── BOWLER CHANGE MODAL ── */}
      <Modal visible={showBowlerModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>🎯 Over Complete!</Text>
            <Text style={{ color: '#fdba74', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
              Select bowler for the next over
            </Text>
            <Text style={styles.label}>Bowler (bowling team)</Text>
            <View style={styles.pickerWrap}>
              <Picker
                selectedValue={selectedNewBowler}
                onValueChange={setSelectedNewBowler}
                style={{ color: '#fff' }}
              >
                {(match.bowlingPlayers || []).map((p, i) => {
                  const bowlerBalls = bowlerStats[p]?.balls || 0;
                  const maxOvers = Math.ceil(match.totalOvers / 5);
                  const bowlerFullOvers = Math.floor(bowlerBalls / 6);
                  const atLimit = bowlerFullOvers >= maxOvers;
                  return (
                    <Picker.Item
                      key={i}
                      label={`${p}${atLimit ? ' (limit reached)' : ''} — ${getBowlerOvers(bowlerBalls)} ov ${bowlerTypes[p] ? `(${bowlerTypes[p]})` : ''}`}
                      value={p}
                    />
                  );
                })}
              </Picker>
            </View>
            {selectedNewBowler === match.bowler && (
              <Text style={{ color: '#f59e0b', fontSize: 12, marginBottom: 8, textAlign: 'center' }}>
                ⚠️ Same bowler cannot bowl consecutive overs
              </Text>
            )}

            {/* ── Add new bowler on the fly ── */}
            <Text style={styles.label}>{"Can't find bowler? Add new:"}</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={newBowlerName}
                onChangeText={setNewBowlerName}
                placeholder="Enter bowler name"
                placeholderTextColor="#92400e"
              />
              <TouchableOpacity
                style={[styles.btnBlue, { marginBottom: 0, paddingHorizontal: 16 }]}
                onPress={() => {
                  const name = newBowlerName.trim();
                  if (!name) return;
                  setMatch(prev => ({
                    ...prev,
                    bowlingPlayers: [...(prev.bowlingPlayers || []), name],
                  }));
                  setSelectedNewBowler(name);
                  setNewBowlerName('');
                }}
              >
                <Text style={styles.btnText}>+ Add</Text>
              </TouchableOpacity>
            </View>

            {/* ── Bowler type selection ── */}
            <Text style={styles.label}>Bowler type</Text>
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
              {['Fast', 'Medium', 'Spinner'].map(type => (
                <TouchableOpacity
                  key={type}
                  style={{
                    flex: 1, padding: 10, borderRadius: 10, alignItems: 'center',
                    backgroundColor: selectedBowlerType === type ? '#22c55e' : 'rgba(0,0,0,0.3)',
                    borderWidth: 1, borderColor: selectedBowlerType === type ? '#4ade80' : 'rgba(255,255,255,0.2)',
                  }}
                  onPress={() => setSelectedBowlerType(type)}
                >
                  <Text style={{ color: '#fff', fontWeight: '600', fontSize: 12 }}>
                    {type === 'Fast' ? '⚡ Fast' : type === 'Medium' ? '🎯 Medium' : '🌀 Spinner'}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity
              style={[styles.btnGreen, selectedNewBowler === match.bowler && { opacity: 0.5 }]}
              onPress={confirmNewBowler}
              disabled={selectedNewBowler === match.bowler}
            >
              <Text style={styles.btnText}>✅ Confirm Bowler</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── RETIRED HURT MODAL ── */}
      <Modal visible={showRetiredHurtModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>🏥 Retired Hurt</Text>
            <Text style={{ color: '#fdba74', fontSize: 13, marginBottom: 16, textAlign: 'center' }}>
              Select batsman retiring hurt
            </Text>
            {[match.striker, match.nonStriker].filter(Boolean).map((p, i) => (
              <TouchableOpacity
                key={i}
                style={[styles.btnBlue, { marginBottom: 8 }]}
                onPress={() => retireHurt(p)}
              >
                <Text style={styles.btnText}>🏏 {p}</Text>
              </TouchableOpacity>
            ))}
            {retiredHurtBatsmen.length > 0 && (
              <>
                <Text style={[styles.label, { marginTop: 12 }]}>Return from Retired Hurt:</Text>
                {retiredHurtBatsmen.map((p, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.btnBlue, { marginBottom: 8, backgroundColor: '#22c55e' }]}
                    onPress={() => returnFromRetiredHurt(p)}
                  >
                    <Text style={styles.btnText}>↩️ {p} (return)</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}
            <TouchableOpacity
              style={[styles.btnGreen, { backgroundColor: '#3d2200', marginTop: 8 }]}
              onPress={() => setShowRetiredHurtModal(false)}
            >
              <Text style={styles.btnText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── BOWLER TYPE MODAL ── */}
      <Modal visible={showBowlerTypeModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalBox}>
            <Text style={styles.modalTitle}>🎯 Add Bowler</Text>
            <Text style={{ color: '#bbf7d0', fontSize: 14, marginBottom: 20, textAlign: 'center' }}>
              What type of bowler is {pendingBowlerName}?
            </Text>
            <TouchableOpacity
              style={[styles.btnGreen, { marginBottom: 10 }]}
              onPress={() => confirmBowlerType('pacer')}>
              <Text style={styles.btnText}>⚡ Pacer (Fast Bowler)</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnGreen, { backgroundColor: '#7c3aed', borderColor: '#c084fc', marginBottom: 10 }]}
              onPress={() => confirmBowlerType('spinner')}>
              <Text style={styles.btnText}>🌀 Spinner</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.btnGreen, { backgroundColor: 'rgba(0,0,0,0.3)', borderColor: 'rgba(255,255,255,0.2)' }]}
              onPress={() => confirmBowlerType('unknown')}>
              <Text style={styles.btnText}>❓ Not Sure</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

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
                .filter(p =>
                  p !== match.nonStriker &&
                  p !== match.bowler &&
                  !dismissedBatsmen.includes(p)
                )
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
            <Text style={{ color: '#fdba74', textAlign: 'center', marginBottom: 8 }}>
              {firstInningsScore?.team} scored
            </Text>
            <Text style={{ color: '#38bdf8', fontSize: 40, fontWeight: 'bold', textAlign: 'center', marginBottom: 16 }}>
              {firstInningsScore?.runs}/{firstInningsScore?.wickets}
            </Text>
            {innings === 1 && (
              <>
                <Text style={{ color: '#fdba74', textAlign: 'center', marginBottom: 4 }}>
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
                  style={[styles.btnGreen, { backgroundColor: '#3d2200', marginTop: 10 }]}
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
                    <View style={{ backgroundColor: '#2a1000', borderRadius: 12, padding: 14, marginBottom: 12 }}>
                      <Text style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: 18, textAlign: 'center' }}>
                        {resultData.resultType === 'tie' ? '🤝 Match Tied!' : `🏆 ${resultData.winner} Won!`}
                      </Text>
                      {resultData.resultType !== 'tie' && (
                        <Text style={{ color: '#fdba74', fontSize: 13, textAlign: 'center', marginTop: 4 }}>
                          by {resultData.margin}
                        </Text>
                      )}
                      <View style={{ flexDirection: 'row', justifyContent: 'space-around', marginTop: 12 }}>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ color: '#92400e', fontSize: 11 }}>1st Inn</Text>
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{resultData.firstScore}</Text>
                          <Text style={{ color: '#fdba74', fontSize: 11 }}>{resultData.firstTeam}</Text>
                        </View>
                        <View style={{ alignItems: 'center' }}>
                          <Text style={{ color: '#92400e', fontSize: 11 }}>2nd Inn</Text>
                          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 16 }}>{resultData.secondScore}</Text>
                          <Text style={{ color: '#fdba74', fontSize: 11 }}>{resultData.secondTeam}</Text>
                        </View>
                      </View>
                    </View>
                  )}
                  {/* Man of the Match */}
                  {motm && (
                    <View style={{ backgroundColor: '#1a1a0a', borderRadius: 12, padding: 12, marginBottom: 12, alignItems: 'center', borderWidth: 1, borderColor: '#f59e0b' }}>
                      <Text style={{ color: '#f59e0b', fontWeight: 'bold', fontSize: 13, marginBottom: 4 }}>🌟 Man of the Match</Text>
                      <Text style={{ color: '#fff', fontSize: 18, fontWeight: 'bold' }}>{motm.name}</Text>
                      <Text style={{ color: '#fdba74', fontSize: 12, marginTop: 4 }}>
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
                    style={[styles.btnGreen, { backgroundColor: '#3d2200', marginTop: 10 }]}
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

      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
        {/* ── 🎙️ Commentary Toggle ── */}
        <View style={styles.commentaryBar}>
          <TouchableOpacity
            style={[styles.commentaryToggle, commentaryOn && styles.commentaryToggleOn]}
            onPress={() => { if (commentaryOn) Speech.stop(); setCommentaryOn(!commentaryOn); }}
          >
            <Text style={styles.commentaryToggleText}>
              {commentaryOn ? '🎙️ ON' : '🔇 OFF'}
            </Text>
          </TouchableOpacity>
          {commentaryOn && (
            <View style={styles.langRow}>
              <TouchableOpacity
                style={[styles.langBtn, commentaryLang === 'en' && styles.langBtnActive]}
                onPress={() => setCommentaryLang('en')}
              >
                <Text style={styles.langBtnText}>🇬🇧 EN</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.langBtn, commentaryLang === 'ur' && styles.langBtnActive]}
                onPress={() => setCommentaryLang('ur')}
              >
                <Text style={styles.langBtnText}>🇵🇰 UR</Text>
              </TouchableOpacity>
            </View>
          )}
          <Text style={styles.title}>🏏 Live Scoring</Text>
        </View>
        <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
          {commentaryOn && (
            <TouchableOpacity
              style={{
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                backgroundColor: commentaryLang === 'en' ? '#f97316' : '#2a1800',
                borderWidth: 1, borderColor: '#f97316',
              }}
              onPress={() => setCommentaryLang(commentaryLang === 'en' ? 'ur' : 'en')}
            >
              <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
                {commentaryLang === 'en' ? '🇬🇧 EN' : '🇵🇰 UR'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={{
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              backgroundColor: commentaryOn ? '#f97316' : '#2a1800',
              borderWidth: 1.5, borderColor: '#f97316',
            }}
            onPress={() => {
              if (commentaryOn) Speech.stop();
              setCommentaryOn(prev => !prev);
            }}
          >
            <Text style={{ color: '#fff', fontSize: 11, fontWeight: 'bold' }}>
              {commentaryOn ? '🔊 Voice ON' : '🔇 Voice OFF'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

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
          <Text style={{ color: '#92400e', textAlign: 'center', fontSize: 11, marginBottom: 4 }}>
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
                  isOut && { color: '#92400e' }
                ]}>
                  {p}{isStriker ? ' *' : ''}
                </Text>
                {isOut && !retiredHurtBatsmen.includes(p) && (
                  <Text style={{ fontSize: 10, color: '#ef4444', fontWeight: '600' }}>
                    (out)
                  </Text>
                )}
                {retiredHurtBatsmen.includes(p) && (
                  <Text style={{ fontSize: 10, color: '#f59e0b', fontWeight: '600' }}>
                    (ret. hurt)
                  </Text>
                )}
              </View>
              <Text style={[styles.tableCell,
                isOut && { color: '#92400e' },
                !isOut && batsmenStats[p].runs >= 50 && { color: '#f59e0b', fontWeight: 'bold' }
              ]}>{batsmenStats[p].runs}</Text>
              <Text style={[styles.tableCell, isOut && { color: '#92400e' }]}>{batsmenStats[p].balls}</Text>
              <Text style={[styles.tableCell, isOut && { color: '#92400e' }]}>{strikeRate(p)}</Text>
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
            <View style={{ flex: 2, flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Text style={[styles.tableCell, { flex: 0 }, match.bowler === b && { color: '#f59e0b', fontWeight: 'bold' }]}>
                {b}{match.bowler === b ? ' *' : ''}
              </Text>
              {bowlerTypes[b] && (
                <Text style={{ fontSize: 11 }}>
                  {bowlerTypes[b] === 'spinner' ? '🌀' : '⚡'}
                </Text>
              )}
            </View>
            <Text style={styles.tableCell}>
              {getBowlerOvers(bowlerStats[b].balls)}
            </Text>
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

      {/* ── ADD PLAYER — Batting or Bowling team ── */}
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 4 }}>
        <TextInput
          placeholder="Add player name"
          placeholderTextColor="#94a3b8"
          value={newPlayer}
          onChangeText={setNewPlayer}
          style={[styles.input, { flex: 1, marginBottom: 0 }]}
        />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 8 }}>
        <TouchableOpacity
          style={[styles.btnBlue, { flex: 1 }]}
          onPress={() => addPlayer('batting')}>
          <Text style={styles.btnText}>+ Batting</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.btnBlue, { flex: 1, backgroundColor: '#f59e0b' }]}
          onPress={() => addPlayer('bowling')}>
          <Text style={styles.btnText}>+ Bowling</Text>
        </TouchableOpacity>
      </View>

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
        <TouchableOpacity
          style={[styles.btn, { backgroundColor: '#0891b2' }]}
          onPress={() => setShowRetiredHurtModal(true)}>
          <Text style={styles.btnText}>Ret. Hurt</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.btn, styles.btnUndo]} onPress={undoLastBall}>
          <Text style={styles.btnText}>Undo</Text>
        </TouchableOpacity>
      </View>

      {/* ── Collapsible Wide section ── */}
      <TouchableOpacity
        style={styles.extraHeader}
        onPress={() => setShowWides(prev => !prev)}>
        <Text style={styles.extraHeaderText}>
          🏏 Wide {showWides ? '▲' : '▼'}
        </Text>
        {match.freeHit && <View style={styles.freeHitBadge}><Text style={styles.freeHitText}>⚡ FREE HIT</Text></View>}
      </TouchableOpacity>
      {showWides && (
        <View style={styles.row}>
          {[0,1,2,3,4].map(r => (
            <TouchableOpacity key={r}
              style={[styles.btnSmall, { backgroundColor: '#b45309' }]}
              onPress={() => { r === 0 ? addBall('wide') : addBall('wideRun', r); setShowWides(false); }}>
              <Text style={styles.btnText}>{r === 0 ? 'Wd' : `Wd+${r}`}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Collapsible No Ball section ── */}
      <TouchableOpacity
        style={styles.extraHeader}
        onPress={() => setShowNoBalls(prev => !prev)}>
        <Text style={styles.extraHeaderText}>🚫 No Ball {showNoBalls ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {showNoBalls && (
        <View style={styles.row}>
          {[0,1,2,3,4,6].map(r => (
            <TouchableOpacity key={r}
              style={[styles.btnSmall, { backgroundColor: '#7c3aed' }]}
              onPress={() => { r === 0 ? addBall('noBall') : addBall('noBallRun', r); setShowNoBalls(false); }}>
              <Text style={styles.btnText}>{r === 0 ? 'NB' : `NB+${r}`}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ── Collapsible Bye section ── */}
      <TouchableOpacity
        style={styles.extraHeader}
        onPress={() => setShowByes(prev => !prev)}>
        <Text style={styles.extraHeaderText}>🏃 Bye {showByes ? '▲' : '▼'}</Text>
      </TouchableOpacity>
      {showByes && (
        <View style={styles.row}>
          {[1,2,3,4].map(r => (
            <TouchableOpacity key={r}
              style={[styles.btnSmall, { backgroundColor: '#0f766e' }]}
              onPress={() => { addBall('bye', r); setShowByes(false); }}>
              <Text style={styles.btnText}>Bye {r}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

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
        <Text style={styles.btnText}>
          {matchResult ? '💾 Save Again' : '💾 Save Match'}
        </Text>
      </TouchableOpacity>

      {/* ── Row 2: Navigation buttons ── */}
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <TouchableOpacity
          style={[styles.navBtn, { backgroundColor: '#3d2200' }]}
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
        <TouchableOpacity
          style={[styles.navBtn, { backgroundColor: '#7c3aed' }]}
          onPress={() => router.push('/coaching')}>
          <Text style={styles.navBtnText}>🧠 AI Coach</Text>
        </TouchableOpacity>
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  // ── 🔥 SUNSET ORANGE THEME ──
  container: { flex: 1, backgroundColor: '#1a1008', padding: 16 },
  commentaryBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  commentaryToggle: { flex: 1, padding: 10, borderRadius: 10, backgroundColor: '#2a1800', borderWidth: 1, borderColor: '#78350f', alignItems: 'center' },
  commentaryToggleOn: { backgroundColor: '#f97316', borderColor: '#fdba74' },
  commentaryToggleText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  voiceRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 },
  voiceToggle: {
    flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 24,
    backgroundColor: '#2a1800', borderWidth: 1.5, borderColor: '#78350f',
    alignItems: 'center',
  },
  voiceToggleOn: { backgroundColor: '#f97316', borderColor: '#fdba74' },
  voiceToggleText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  langRow: { flexDirection: 'row', gap: 6 },
  langBtn: {
    paddingVertical: 8, paddingHorizontal: 12, borderRadius: 20,
    backgroundColor: '#2a1800', borderWidth: 1, borderColor: '#78350f',
  },
  langBtnActive: { backgroundColor: '#f97316', borderColor: '#fdba74' },
  langBtnText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  title: { fontSize: 24, color: '#fff', textAlign: 'center', marginBottom: 20, fontWeight: 'bold' },

  card: { backgroundColor: '#2a1800', padding: 15, borderRadius: 15, marginBottom: 14, borderWidth: 1, borderColor: '#3d2200' },
  score: { fontSize: 52, color: '#fff', textAlign: 'center', fontWeight: 'bold' },
  overs: { color: '#fdba74', textAlign: 'center', fontSize: 15, marginBottom: 4 },
  runRate: { color: '#fb923c', textAlign: 'center', fontSize: 13, marginBottom: 6, fontWeight: '700' },
  targetRow: { flexDirection: 'row', justifyContent: 'space-around', alignItems: 'center', backgroundColor: 'rgba(0,0,0,0.35)', borderRadius: 10, padding: 10, marginBottom: 6 },
  targetItem: { alignItems: 'center', flex: 1 },
  targetVal: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  targetLabel: { color: '#fdba74', fontSize: 10, marginTop: 2 },
  targetDivider: { width: 0.5, height: 30, backgroundColor: '#3d2200' },
  matchStatusText: { color: '#fdba74', textAlign: 'center', fontSize: 12, marginBottom: 6 },
  venueText: { color: '#a16207', textAlign: 'center', fontSize: 12, marginBottom: 2 },
  batterRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 8 },
  batterText: { color: '#fff', fontSize: 13 },
  batterItem: { flex: 1 },
  batterName: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
  batterStatus: { color: '#fb923c', fontSize: 11, marginTop: 2 },
  dismissedRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 3, borderTopWidth: 0.5, borderTopColor: '#3d2200', marginTop: 4 },
  dismissedName: { color: '#92400e', fontSize: 12 },
  dismissedScore: { color: '#fca5a5', fontSize: 12 },
  bowlerText: { color: '#fb923c', fontSize: 13, marginTop: 4, fontWeight: '600' },

  sectionTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 8 },
  label: { color: '#fdba74', marginTop: 8, fontSize: 13 },
  emptyHint: { color: '#92400e', fontSize: 13, paddingVertical: 4 },

  tableRow: { flexDirection: 'row', paddingVertical: 4 },
  tableHead: { flex: 1, color: '#fb923c', fontSize: 12, fontWeight: 'bold' },
  tableCell: { flex: 1, color: '#fff', fontSize: 13 },

  input: {
    backgroundColor: '#2a1800', color: '#fff',
    padding: 12, borderRadius: 10, marginBottom: 10,
    borderWidth: 1, borderColor: '#3d2200'
  },

  row: { flexDirection: 'row', justifyContent: 'space-between', marginVertical: 6, gap: 6 },

  btn: {
    backgroundColor: '#2a1800', paddingVertical: 16, paddingHorizontal: 8,
    borderRadius: 12, flex: 1, alignItems: 'center',
    borderWidth: 1.5, borderColor: '#f97316',
    elevation: 4,
  },
  sectionLabel: { paddingHorizontal: 4, marginTop: 6, marginBottom: 2 },
  extraHeader: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    backgroundColor: '#2a1800', borderRadius: 10, padding: 12,
    marginTop: 6, marginBottom: 2, borderWidth: 1, borderColor: '#3d2200'
  },
  extraHeaderText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  freeHitBadge: { backgroundColor: '#f97316', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 2 },
  freeHitText: { color: '#fff', fontSize: 10, fontWeight: 'bold' },
  sectionLabelText: { color: '#fb923c', fontSize: 11, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  btnSmall: {
    backgroundColor: '#2a1800', paddingVertical: 12, paddingHorizontal: 6,
    borderRadius: 10, flex: 1, alignItems: 'center',
    borderWidth: 1, borderColor: '#3d2200',
    elevation: 2,
  },
  btnTwo: { backgroundColor: '#1c3a5c', borderColor: '#38bdf8' },
  navBtn: {
    flex: 1, paddingVertical: 12, borderRadius: 10,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1, borderColor: '#3d2200',
    backgroundColor: '#2a1800',
  },
  navBtnText: { color: '#fdba74', fontWeight: '700', fontSize: 11, textAlign: 'center' },
  btnFour: { backgroundColor: '#1a3000', borderColor: '#22c55e' },
  btnSix: { backgroundColor: '#2a0a30', borderColor: '#d946ef' },
  btnRed: { backgroundColor: '#7f1d1d', borderColor: '#f87171' },
  btnUndo: { backgroundColor: '#111', borderColor: '#3d2200' },
  btnBlue: {
    backgroundColor: '#1c3a5c', padding: 12, borderRadius: 10,
    alignItems: 'center', marginBottom: 14,
    borderWidth: 1, borderColor: '#38bdf8', elevation: 3,
  },
  btnGreen: {
    backgroundColor: '#f97316', padding: 15, borderRadius: 12,
    alignItems: 'center', marginTop: 6,
    borderWidth: 1.5, borderColor: '#fdba74', elevation: 4,
  },
  btnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  overRow: { marginBottom: 10 },
  overLabel: { color: '#fb923c', fontSize: 12, marginBottom: 4, fontWeight: '600' },
  overBalls: { flexDirection: 'row', flexWrap: 'wrap', gap: 4 },
  ballBubble: {
    backgroundColor: '#2a1800', borderRadius: 8,
    paddingHorizontal: 10, paddingVertical: 5,
    borderWidth: 1, borderColor: '#3d2200',
  },
  ballBubbleText: { color: '#fdba74', fontSize: 11, fontWeight: '600' },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center', alignItems: 'center'
  },
  modalCard: {
    backgroundColor: '#2a1800', borderRadius: 16,
    padding: 20, width: '85%',
    borderWidth: 1.5, borderColor: '#f97316',
  },
  modalTitle: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 12 },
  modalBox: {
    backgroundColor: '#2a1800', borderRadius: 16,
    padding: 20, width: '85%',
    borderWidth: 1.5, borderColor: '#f97316',
  },
  pickerWrap: {
    backgroundColor: '#1a1008', borderRadius: 10,
    marginBottom: 12, borderWidth: 1, borderColor: '#3d2200',
  },
});
