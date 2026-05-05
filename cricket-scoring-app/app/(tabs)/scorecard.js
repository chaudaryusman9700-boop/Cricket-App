import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Share, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';

export default function ScorecardScreen() {
  const [matchData, setMatchData] = useState(null);
  const [firstInnings, setFirstInnings] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const data = await AsyncStorage.getItem('currentMatch');
      if (data) setMatchData(JSON.parse(data));
      const fi = await AsyncStorage.getItem('firstInnings');
      if (fi) setFirstInnings(JSON.parse(fi));
    } catch (e) { console.log(e); }
  };

  if (!matchData) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📋</Text>
        <Text style={styles.emptyTitle}>No match data yet</Text>
        <Text style={styles.emptySubtitle}>Start and save a match to see the full scorecard.</Text>
      </View>
    );
  }

  const match = matchData.match || matchData;
  const batsmenStats = matchData.batsmenStats || {};
  const bowlerStats = matchData.bowlerStats || {};
  const ballHistory = [...(match.ballHistory || [])].reverse();

  // ── Man of the Match ──
  const getMotm = () => {
    const allBat = { ...(firstInnings?.batsmenStats || {}), ...batsmenStats };
    const allBowl = { ...(firstInnings?.bowlerStats || {}), ...bowlerStats };
    let best = null, bestScore = -1;
    const allPlayers = new Set([...Object.keys(allBat), ...Object.keys(allBowl)]);
    allPlayers.forEach(name => {
      const bat = allBat[name] || { runs: 0, balls: 0 };
      const bowl = allBowl[name] || { wickets: 0, balls: 0, runs: 0 };
      const sr = bat.balls > 0 ? (bat.runs / bat.balls) * 100 : 0;
      const eco = bowl.balls > 0 ? bowl.runs / (bowl.balls / 6) : 99;
      const score = (bat.runs * 1.5) + (bowl.wickets * 25) + (sr > 150 ? 10 : 0) + (eco < 6 ? 15 : 0);
      if (score > bestScore) {
        bestScore = score;
        best = { name, runs: bat.runs, balls: bat.balls, wickets: bowl.wickets };
      }
    });
    return best;
  };

  // ── Build batting card ──
  const buildBattingCard = (stats, history, currentStriker) => {
    return Object.entries(stats).map(([name, s]) => {
      const balls = history.filter(b => b.striker === name);
      const fours = balls.filter(b => b.run === 4 && b.type === 'run').length;
      const sixes = balls.filter(b => b.run === 6 && b.type === 'run').length;
      const sr = s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(1) : '0.0';
      const wicketBall = history.find(b => b.type === 'wicket' && b.striker === name);
      let dismissal = wicketBall ? `b ${wicketBall.bowler || '—'}` :
        name === currentStriker ? 'batting *' : 'not out';
      return { name, runs: s.runs, balls: s.balls, fours, sixes, sr, dismissal };
    });
  };

  // ── Build bowling card ──
  const buildBowlingCard = (stats, history) => {
    return Object.entries(stats).map(([name, s]) => {
      const overs = `${Math.floor(s.balls / 6)}.${s.balls % 6}`;
      const eco = s.balls > 0 ? (s.runs / (s.balls / 6)).toFixed(1) : '0.0';
      const bowlerBalls = history.filter(b => b.bowler === name);
      const overGroups = {};
      bowlerBalls.forEach(b => {
        const ov = b.over?.split('.')[0] || '0';
        if (!overGroups[ov]) overGroups[ov] = [];
        overGroups[ov].push(b);
      });
      let maidens = 0;
      Object.values(overGroups).forEach(balls => {
        if (balls.length === 6) {
          const r = balls.reduce((sum, b) => {
            if (b.type === 'run') return sum + b.run;
            if (['wide', 'noBall'].includes(b.type)) return sum + 1;
            return sum;
          }, 0);
          if (r === 0) maidens++;
        }
      });
      return { name, overs, maidens, runs: s.runs, wickets: s.wickets, eco };
    });
  };

  // ── Build extras ──
  const buildExtras = (history) => {
    let wide = 0, noBall = 0, bye = 0;
    history.forEach(b => {
      if (['wide', 'wideRun', 'wideBoundary'].includes(b.type)) wide += b.type === 'wide' ? 1 : b.type === 'wideRun' ? 1 + b.run : 5;
      else if (['noBall', 'noBallRun'].includes(b.type)) noBall += b.type === 'noBall' ? 1 : 1 + b.run;
      else if (b.type === 'bye') bye += b.run;
      else if (b.type === 'byeBoundary') bye += 4;
    });
    return { wide, noBall, bye, total: wide + noBall + bye };
  };

  // ── Build FOW ──
  const buildFOW = (history) => {
    return history.filter(b => b.type === 'wicket').map((w, i) => ({
      num: i + 1, over: w.over, batsman: w.striker,
    }));
  };

  const getOvers = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
  const runRate = match.balls > 0 ? (match.runs / (match.balls / 6)).toFixed(2) : '0.00';

  // Current innings data
  const batting2 = buildBattingCard(batsmenStats, ballHistory, match.striker);
  const bowling2 = buildBowlingCard(bowlerStats, ballHistory);
  const extras2 = buildExtras(ballHistory);
  const fow2 = buildFOW(ballHistory);

  // First innings data
  const fi = firstInnings;
  const fiHistory = fi ? [...(fi.ballHistory || [])].reverse() : [];
  const batting1 = fi ? buildBattingCard(fi.batsmenStats || {}, fiHistory, '') : [];
  const bowling1 = fi ? buildBowlingCard(fi.bowlerStats || {}, fiHistory) : [];
  const extras1 = fi ? buildExtras(fiHistory) : null;
  const fow1 = fi ? buildFOW(fiHistory) : [];

  const motm = getMotm();

  // ── Innings section component ──
  const InningsCard = ({ title, score, overs, batting, bowling, extras, fow, totalOvers, isSecond }) => (
    <>
      {/* Header */}
      <View style={[styles.inningsHeader, isSecond && { backgroundColor: '#1a3a2a' }]}>
        <Text style={styles.inningsLabel}>{isSecond ? '2nd Innings' : '1st Innings'}</Text>
        <Text style={styles.inningsTeam}>{title}</Text>
        <Text style={styles.inningsScore}>{score}</Text>
        <Text style={styles.inningsOvers}>({overs} ov){totalOvers ? ` / ${totalOvers}` : ''}</Text>
      </View>

      {/* Batting */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>BATTING</Text>
        <View style={[styles.row, styles.headerRow]}>
          <Text style={[styles.col, styles.colBig, styles.colHead]}>Batter</Text>
          <Text style={[styles.colHead, styles.colMid]}>R</Text>
          <Text style={[styles.colHead, styles.colMid]}>B</Text>
          <Text style={[styles.colHead, styles.colMid]}>4s</Text>
          <Text style={[styles.colHead, styles.colMid]}>6s</Text>
          <Text style={[styles.colHead, styles.colMid]}>SR</Text>
        </View>
        {batting.length === 0 && <Text style={styles.noData}>No data</Text>}
        {batting.map((b, i) => (
          <View key={i} style={[styles.row, i % 2 === 0 && styles.rowAlt]}>
            <View style={[styles.col, styles.colBig]}>
              <Text style={[styles.playerName, b.dismissal === 'batting *' && { color: '#38bdf8' }]}>
                {b.name}{b.dismissal === 'batting *' ? ' *' : ''}
              </Text>
              <Text style={styles.dismissalText}>{b.dismissal}</Text>
            </View>
            <Text style={[styles.colVal, styles.colMid, b.runs >= 50 && { color: '#f59e0b' }]}>{b.runs}</Text>
            <Text style={[styles.colVal, styles.colMid]}>{b.balls}</Text>
            <Text style={[styles.colVal, styles.colMid, { color: '#22c55e' }]}>{b.fours}</Text>
            <Text style={[styles.colVal, styles.colMid, { color: '#a855f7' }]}>{b.sixes}</Text>
            <Text style={[styles.colVal, styles.colMid]}>{b.sr}</Text>
          </View>
        ))}
        <View style={[styles.row, styles.extrasRow]}>
          <Text style={[styles.col, styles.colBig, styles.extrasLabel]}>Extras</Text>
          <Text style={styles.extrasVal}>{extras?.total || 0} (w {extras?.wide || 0}, nb {extras?.noBall || 0}, b {extras?.bye || 0})</Text>
        </View>
        <View style={[styles.row, styles.totalRow]}>
          <Text style={[styles.col, styles.colBig, styles.totalLabel]}>TOTAL</Text>
          <Text style={styles.totalVal}>{score}  ({overs} Ov)</Text>
        </View>
      </View>

      {/* Fall of wickets */}
      {fow.length > 0 && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>FALL OF WICKETS</Text>
          <View style={styles.fowWrap}>
            {fow.map((w, i) => (
              <View key={i} style={styles.fowChip}>
                <Text style={styles.fowScore}>{w.num}-W</Text>
                <Text style={styles.fowOver}>Ov {w.over}</Text>
                <Text style={styles.fowName}>{w.batsman}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      {/* Bowling */}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>BOWLING</Text>
        <View style={[styles.row, styles.headerRow]}>
          <Text style={[styles.col, styles.colBig, styles.colHead]}>Bowler</Text>
          <Text style={[styles.colHead, styles.colMid]}>O</Text>
          <Text style={[styles.colHead, styles.colMid]}>M</Text>
          <Text style={[styles.colHead, styles.colMid]}>R</Text>
          <Text style={[styles.colHead, styles.colMid]}>W</Text>
          <Text style={[styles.colHead, styles.colMid]}>Eco</Text>
        </View>
        {bowling.length === 0 && <Text style={styles.noData}>No data</Text>}
        {bowling.map((b, i) => (
          <View key={i} style={[styles.row, i % 2 === 0 && styles.rowAlt]}>
            <View style={[styles.col, styles.colBig]}>
              <Text style={[styles.playerName, { color: '#f59e0b' }]}>{b.name}</Text>
            </View>
            <Text style={[styles.colVal, styles.colMid]}>{b.overs}</Text>
            <Text style={[styles.colVal, styles.colMid]}>{b.maidens}</Text>
            <Text style={[styles.colVal, styles.colMid]}>{b.runs}</Text>
            <Text style={[styles.colVal, styles.colMid, b.wickets >= 3 && { color: '#ef4444', fontWeight: 'bold' }]}>{b.wickets}</Text>
            <Text style={[styles.colVal, styles.colMid,
              parseFloat(b.eco) <= 6 ? { color: '#22c55e' } :
              parseFloat(b.eco) <= 10 ? { color: '#f59e0b' } : { color: '#ef4444' }]}>
              {b.eco}
            </Text>
          </View>
        ))}
      </View>
    </>
  );

  const shareScorecard = async () => {
    let text = `🏏 CRICKET SCORECARD\n${'═'.repeat(30)}\n`;
    if (fi) text += `1ST INNINGS: ${fi.team} — ${fi.runs}/${fi.wickets} (${getOvers(fi.balls)} ov)\n`;
    text += `2ND INNINGS: ${match.battingTeam} — ${match.runs}/${match.wickets} (${getOvers(match.balls)} ov)\n`;
    if (motm) text += `\n🌟 Man of the Match: ${motm.name} — ${motm.runs} runs, ${motm.wickets} wickets\n`;
    try { await Share.share({ message: text }); } catch (e) {}
  };

  return (
    <ScrollView style={styles.container}>

      {/* Match header */}
      <View style={styles.header}>
        <Text style={styles.teamName}>{match.battingTeam}</Text>
        <Text style={styles.bigScore}>{match.runs}/{match.wickets}</Text>
        <Text style={styles.oversText}>({getOvers(match.balls)} ov) · RR: {runRate}</Text>
        {fi && <Text style={styles.firstInningsRef}>1st Inn: {fi.team} {fi.runs}/{fi.wickets}</Text>}
        {match.venue ? <Text style={styles.metaText}>📍 {match.venue}</Text> : null}
        {match.matchDate ? <Text style={styles.metaText}>📅 {match.matchDate} {match.matchTime}</Text> : null}
      </View>

      {/* First innings */}
      {fi && (
        <InningsCard
          title={fi.team}
          score={`${fi.runs}/${fi.wickets}`}
          overs={getOvers(fi.balls)}
          batting={batting1}
          bowling={bowling1}
          extras={extras1}
          fow={fow1}
          totalOvers={match.totalOvers}
          isSecond={false}
        />
      )}

      {/* Second innings */}
      <InningsCard
        title={match.battingTeam}
        score={`${match.runs}/${match.wickets}`}
        overs={getOvers(match.balls)}
        batting={batting2}
        bowling={bowling2}
        extras={extras2}
        fow={fow2}
        totalOvers={match.totalOvers}
        isSecond={fi !== null}
      />

      {/* Man of the Match */}
      {motm && (
        <View style={[styles.card, { alignItems: 'center', borderWidth: 1, borderColor: '#f59e0b' }]}>
          <Text style={{ color: '#f59e0b', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, marginBottom: 8 }}>🌟 MAN OF THE MATCH</Text>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#1d4ed8', justifyContent: 'center', alignItems: 'center', marginBottom: 8 }}>
            <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 24 }}>{motm.name.charAt(0)}</Text>
          </View>
          <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 22, marginBottom: 4 }}>{motm.name}</Text>
          <Text style={{ color: '#94a3b8', fontSize: 13 }}>
            {motm.runs > 0 ? `${motm.runs} runs (${motm.balls}b)` : ''}
            {motm.runs > 0 && motm.wickets > 0 ? ' · ' : ''}
            {motm.wickets > 0 ? `${motm.wickets} wickets` : ''}
          </Text>
        </View>
      )}

      {/* Share */}
      <TouchableOpacity style={styles.shareBtn} onPress={shareScorecard}>
        <Text style={styles.shareBtnText}>📤 Share Scorecard</Text>
      </TouchableOpacity>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a' },
  emptyContainer: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  emptySubtitle: { color: '#475569', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  header: { backgroundColor: '#1e3a5f', padding: 20, alignItems: 'center', marginBottom: 8, borderBottomLeftRadius: 20, borderBottomRightRadius: 20 },
  teamName: { color: '#93c5fd', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  bigScore: { color: '#fff', fontSize: 52, fontWeight: 'bold', lineHeight: 60 },
  oversText: { color: '#93c5fd', fontSize: 14, marginBottom: 4 },
  firstInningsRef: { color: '#f59e0b', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  metaText: { color: '#64748b', fontSize: 12, marginTop: 2 },

  inningsHeader: { backgroundColor: '#1e293b', marginHorizontal: 14, borderRadius: 12, padding: 12, marginBottom: 4, marginTop: 10 },
  inningsLabel: { color: '#64748b', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },
  inningsTeam: { color: '#fff', fontSize: 16, fontWeight: 'bold', marginTop: 2 },
  inningsScore: { color: '#38bdf8', fontSize: 32, fontWeight: 'bold' },
  inningsOvers: { color: '#94a3b8', fontSize: 13 },

  card: { backgroundColor: '#1e293b', marginHorizontal: 14, borderRadius: 14, marginBottom: 8, overflow: 'hidden' },
  cardTitle: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold', letterSpacing: 1, padding: 10, paddingBottom: 6, borderBottomWidth: 0.5, borderBottomColor: '#334155' },

  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 8, paddingHorizontal: 10 },
  headerRow: { backgroundColor: '#0f172a', paddingVertical: 6 },
  rowAlt: { backgroundColor: '#162032' },
  extrasRow: { borderTopWidth: 0.5, borderTopColor: '#334155', paddingVertical: 8 },
  totalRow: { backgroundColor: '#0f172a', paddingVertical: 10, borderTopWidth: 0.5, borderTopColor: '#334155' },

  col: { justifyContent: 'center' },
  colBig: { flex: 2.5 },
  colMid: { flex: 1, textAlign: 'center' },
  colHead: { color: '#64748b', fontSize: 11, fontWeight: 'bold', textAlign: 'center' },
  colVal: { color: '#e2e8f0', fontSize: 13 },

  playerName: { color: '#fff', fontSize: 13, fontWeight: '500' },
  dismissalText: { color: '#64748b', fontSize: 11, marginTop: 1 },
  extrasLabel: { color: '#94a3b8', fontSize: 13 },
  extrasVal: { color: '#94a3b8', fontSize: 12, flex: 3 },
  totalLabel: { color: '#fff', fontSize: 14, fontWeight: 'bold' },
  totalVal: { color: '#38bdf8', fontSize: 14, fontWeight: 'bold', flex: 3 },
  noData: { color: '#475569', fontSize: 13, textAlign: 'center', padding: 12 },

  fowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 10 },
  fowChip: { backgroundColor: '#0f172a', borderRadius: 8, padding: 8, minWidth: 70, alignItems: 'center' },
  fowScore: { color: '#ef4444', fontSize: 12, fontWeight: 'bold' },
  fowOver: { color: '#64748b', fontSize: 10, marginTop: 2 },
  fowName: { color: '#94a3b8', fontSize: 11, marginTop: 2 },

  shareBtn: { backgroundColor: '#22c55e', margin: 14, padding: 15, borderRadius: 12, alignItems: 'center' },
  shareBtnText: { color: '#0f172a', fontWeight: 'bold', fontSize: 15 },
});