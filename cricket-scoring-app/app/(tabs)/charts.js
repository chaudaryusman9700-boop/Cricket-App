import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Dimensions
} from 'react-native';
import { useFocusEffect } from 'expo-router';

const SCREEN_W = Dimensions.get('window').width;
const CHART_W = SCREEN_W - 64;

export default function ChartsScreen() {
  const [matchData, setMatchData] = useState(null);
  const [activeTab, setActiveTab] = useState('runrate');

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [])
  );

  const loadData = async () => {
    try {
      const data = await AsyncStorage.getItem('currentMatch');
      if (data) setMatchData(JSON.parse(data));
    } catch (e) { console.log(e); }
  };

  if (!matchData) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📊</Text>
        <Text style={styles.emptyTitle}>No match data yet</Text>
        <Text style={styles.emptySubtitle}>Start scoring a match and come back here to see live charts.</Text>
      </View>
    );
  }

  const match = matchData.match || matchData;
  const batsmenStats = matchData.batsmenStats || {};
  const bowlerStats = matchData.bowlerStats || {};
  const ballHistory = [...(match.ballHistory || [])].reverse();

  // ── Build run-per-over data ──
  const overRuns = {};
  ballHistory.forEach(b => {
    const ov = b.over?.split('.')[0] || '0';
    if (!overRuns[ov]) overRuns[ov] = 0;
    if (b.type === 'run') overRuns[ov] += b.run;
    else if (b.type === 'wide') overRuns[ov] += 1;
    else if (b.type === 'wideRun') overRuns[ov] += 1 + b.run;
    else if (b.type === 'wideBoundary') overRuns[ov] += 5;
    else if (b.type === 'noBall') overRuns[ov] += 1;
    else if (b.type === 'noBallRun') overRuns[ov] += 1 + b.run;
    else if (b.type === 'bye') overRuns[ov] += b.run;
    else if (b.type === 'byeBoundary') overRuns[ov] += 4;
  });

  const overKeys = Object.keys(overRuns).sort((a, b) => Number(a) - Number(b));
  const overRunValues = overKeys.map(k => overRuns[k]);
  const maxOverRun = Math.max(...overRunValues, 1);

  // Cumulative runs
  let cum = 0;
  const cumulativeRuns = overKeys.map(k => { cum += overRuns[k]; return cum; });

  // ── Extras ──
  let extras = { wide: 0, noBall: 0, bye: 0, dot: 0 };
  ballHistory.forEach(b => {
    if (['wide', 'wideRun', 'wideBoundary'].includes(b.type)) extras.wide++;
    else if (['noBall', 'noBallRun'].includes(b.type)) extras.noBall++;
    else if (['bye', 'byeBoundary'].includes(b.type)) extras.bye++;
    else if (b.type === 'dot') extras.dot++;
  });

  // ── Bar chart ──
  const BarChart = ({ data, labels, colors, maxVal, height = 140 }) => {
    const count = data.length;
    const barW = Math.min(40, Math.max(24, (CHART_W / Math.max(count, 1)) - 10));
    return (
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', flexWrap: 'wrap', gap: 6, minHeight: height + 40 }}>
        {data.map((val, i) => {
          const barH = maxVal > 0 ? Math.max((val / maxVal) * height, 2) : 2;
          const color = Array.isArray(colors) ? colors[i % colors.length] : colors;
          return (
            <View key={i} style={{ alignItems: 'center', width: barW }}>
              <Text style={{ color: '#94a3b8', fontSize: 10, marginBottom: 2 }}>{val}</Text>
              <View style={{ width: barW, height: barH, backgroundColor: color, borderRadius: 4 }} />
              <Text style={{ color: '#64748b', fontSize: 9, marginTop: 3 }} numberOfLines={1}>{labels[i]}</Text>
            </View>
          );
        })}
      </View>
    );
  };

  // ── Line chart ──
  const LineChart = ({ data, labels, color, height = 130 }) => {
    if (data.length < 2) return <Text style={styles.noData}>Not enough data yet</Text>;
    const max = Math.max(...data, 1);
    const pts = data.map((v, i) => ({
      x: (i / (data.length - 1)) * CHART_W,
      y: height - (v / max) * height,
      v,
    }));
    return (
      <View>
        <View style={{ height, width: CHART_W, position: 'relative' }}>
          {[0, 0.25, 0.5, 0.75, 1].map((f, i) => (
            <View key={i} style={{
              position: 'absolute', left: 0, right: 0,
              top: f * height, height: 0.5, backgroundColor: '#334155'
            }} />
          ))}
          {pts.slice(1).map((pt, i) => {
            const prev = pts[i];
            const dx = pt.x - prev.x;
            const dy = pt.y - prev.y;
            const len = Math.sqrt(dx * dx + dy * dy);
            const angle = Math.atan2(dy, dx) * (180 / Math.PI);
            return (
              <View key={i} style={{
                position: 'absolute', left: prev.x, top: prev.y - 1,
                width: len, height: 2, backgroundColor: color,
                borderRadius: 1,
                transform: [{ rotate: `${angle}deg` }],
                transformOrigin: '0 50%',
              }} />
            );
          })}
          {pts.map((pt, i) => (
            <View key={i} style={{
              position: 'absolute', left: pt.x - 5, top: pt.y - 5,
              width: 10, height: 10, borderRadius: 5, backgroundColor: color,
            }} />
          ))}
        </View>
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginTop: 6 }}>
          {labels.map((l, i) => (
            <Text key={i} style={{ color: '#64748b', fontSize: 10 }}>{l}</Text>
          ))}
        </View>
      </View>
    );
  };

  const runRate = match.balls > 0 ? (match.runs / (match.balls / 6)).toFixed(2) : '0.00';
  const topBatsman = Object.entries(batsmenStats).sort((a, b) => b[1].runs - a[1].runs)[0];
  const topBowler = Object.entries(bowlerStats).sort((a, b) => b[1].wickets - a[1].wickets)[0];
  const totalExtras = extras.wide + extras.noBall + extras.bye;

  // ── Run rate progression per ball (for line chart) ──
  let runningTotal = 0;
  const ballByBallRuns = ballHistory.map(b => {
    if (b.type === 'run') runningTotal += b.run;
    else if (b.type === 'wide') runningTotal += 1;
    else if (b.type === 'wideRun') runningTotal += 1 + b.run;
    else if (b.type === 'wideBoundary') runningTotal += 5;
    else if (b.type === 'noBall') runningTotal += 1;
    else if (b.type === 'noBallRun') runningTotal += 1 + b.run;
    else if (b.type === 'bye') runningTotal += b.run;
    else if (b.type === 'byeBoundary') runningTotal += 4;
    return runningTotal;
  });

  // Boundaries per batsman
  const boundaryStats = Object.keys(batsmenStats).map(p => ({
    name: p,
    fours: ballHistory.filter(b => b.striker === p && b.run === 4 && b.type === 'run').length,
    sixes: ballHistory.filter(b => b.striker === p && b.run === 6 && b.type === 'run').length,
  }));

  const tabs = [
    { key: 'runrate', label: '📈 Runs/Over' },
    { key: 'batting', label: '🏏 Batting' },
    { key: 'bowling', label: '🎳 Bowling' },
    { key: 'extras', label: '📊 Extras' },
  ];

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>Match Stats</Text>

      {/* Summary cards */}
      <View style={styles.summaryGrid}>
        {[
          { label: 'Score', val: `${match.runs}/${match.wickets}` },
          { label: 'Run Rate', val: runRate },
          { label: 'Top Bat', val: topBatsman ? `${topBatsman[0]} ${topBatsman[1].runs}` : '—' },
          { label: 'Top Bowl', val: topBowler ? `${topBowler[0]} ${topBowler[1].wickets}w` : '—' },
        ].map(({ label, val }) => (
          <View key={label} style={styles.statCard}>
            <Text style={styles.statLabel}>{label}</Text>
            <Text style={styles.statVal} numberOfLines={1}>{val}</Text>
          </View>
        ))}
      </View>

      {/* Tab bar */}
      <View style={styles.tabBar}>
        {tabs.map(t => (
          <TouchableOpacity
            key={t.key}
            style={[styles.tab, activeTab === t.key && styles.tabActive]}
            onPress={() => setActiveTab(t.key)}>
            <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* RUN RATE TAB */}
      {activeTab === 'runrate' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Runs per over</Text>
          {overKeys.length === 0
            ? <Text style={styles.noData}>No overs completed yet</Text>
            : <BarChart
                data={overRunValues}
                labels={overKeys.map(k => `Ov${Number(k) + 1}`)}
                colors={overRunValues.map(v => v >= 12 ? '#a855f7' : v >= 8 ? '#22c55e' : v >= 4 ? '#38bdf8' : '#334155')}
                maxVal={maxOverRun}
              />
          }
          {cumulativeRuns.length >= 2 && (
            <>
              <Text style={[styles.cardTitle, { marginTop: 24 }]}>Cumulative score</Text>
              <LineChart
                data={cumulativeRuns}
                labels={overKeys.map(k => `${Number(k) + 1}`)}
                color="#38bdf8"
              />
            </>
          )}
        </View>
      )}

      {/* BATTING TAB */}
      {activeTab === 'batting' && (
        <View style={styles.card}>
          {Object.keys(batsmenStats).length === 0
            ? <Text style={styles.noData}>No batting data yet</Text>
            : <>
                <Text style={styles.cardTitle}>Runs scored</Text>
                <BarChart
                  data={Object.values(batsmenStats).map(s => s.runs)}
                  labels={Object.keys(batsmenStats)}
                  colors="#38bdf8"
                  maxVal={Math.max(...Object.values(batsmenStats).map(s => s.runs), 1)}
                />
                <Text style={[styles.cardTitle, { marginTop: 24 }]}>Strike rate</Text>
                <BarChart
                  data={Object.values(batsmenStats).map(s =>
                    s.balls > 0 ? Math.round((s.runs / s.balls) * 100) : 0
                  )}
                  labels={Object.keys(batsmenStats)}
                  colors="#a855f7"
                  maxVal={200}
                />
                <View style={styles.tableWrap}>
                  <View style={styles.tableRow}>
                    <Text style={[styles.tableHead, { flex: 2 }]}>Player</Text>
                    <Text style={styles.tableHead}>R</Text>
                    <Text style={styles.tableHead}>B</Text>
                    <Text style={styles.tableHead}>4s</Text>
                    <Text style={styles.tableHead}>6s</Text>
                    <Text style={styles.tableHead}>SR</Text>
                  </View>
                  {Object.entries(batsmenStats)
                    .sort((a, b) => b[1].runs - a[1].runs)
                    .map(([p, s], i) => {
                      const fours = ballHistory.filter(b => b.striker === p && b.run === 4).length;
                      const sixes = ballHistory.filter(b => b.striker === p && b.run === 6).length;
                      return (
                        <View key={i} style={[styles.tableRow, i % 2 === 0 && { backgroundColor: '#0f172a' }]}>
                          <Text style={[styles.tableCell, { flex: 2, color: '#38bdf8' }]}>{p}</Text>
                          <Text style={[styles.tableCell, { fontWeight: 'bold' }]}>{s.runs}</Text>
                          <Text style={styles.tableCell}>{s.balls}</Text>
                          <Text style={[styles.tableCell, { color: '#22c55e' }]}>{fours}</Text>
                          <Text style={[styles.tableCell, { color: '#a855f7' }]}>{sixes}</Text>
                          <Text style={styles.tableCell}>
                            {s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(1) : '0.0'}
                          </Text>
                        </View>
                      );
                    })}
                </View>
              </>
          }
        </View>
      )}

      {/* BOWLING TAB */}
      {activeTab === 'bowling' && (
        <View style={styles.card}>
          {Object.keys(bowlerStats).length === 0
            ? <Text style={styles.noData}>No bowling data yet</Text>
            : <>
                <Text style={styles.cardTitle}>Wickets taken</Text>
                <BarChart
                  data={Object.values(bowlerStats).map(s => s.wickets)}
                  labels={Object.keys(bowlerStats)}
                  colors="#ef4444"
                  maxVal={Math.max(...Object.values(bowlerStats).map(s => s.wickets), 1)}
                />
                <Text style={[styles.cardTitle, { marginTop: 24 }]}>Economy rate</Text>
                <BarChart
                  data={Object.values(bowlerStats).map(s =>
                    s.balls > 0 ? parseFloat((s.runs / (s.balls / 6)).toFixed(1)) : 0
                  )}
                  labels={Object.keys(bowlerStats)}
                  colors={Object.values(bowlerStats).map(s => {
                    const eco = s.balls > 0 ? s.runs / (s.balls / 6) : 0;
                    return eco <= 6 ? '#22c55e' : eco <= 10 ? '#f59e0b' : '#ef4444';
                  })}
                  maxVal={20}
                />
                <View style={styles.tableWrap}>
                  <View style={styles.tableRow}>
                    <Text style={[styles.tableHead, { flex: 2 }]}>Bowler</Text>
                    <Text style={styles.tableHead}>O</Text>
                    <Text style={styles.tableHead}>R</Text>
                    <Text style={styles.tableHead}>W</Text>
                    <Text style={styles.tableHead}>Eco</Text>
                  </View>
                  {Object.entries(bowlerStats)
                    .sort((a, b) => b[1].wickets - a[1].wickets)
                    .map(([b, s], i) => (
                      <View key={i} style={[styles.tableRow, i % 2 === 0 && { backgroundColor: '#0f172a' }]}>
                        <Text style={[styles.tableCell, { flex: 2, color: '#f59e0b' }]}>{b}</Text>
                        <Text style={styles.tableCell}>{(s.balls / 6).toFixed(1)}</Text>
                        <Text style={styles.tableCell}>{s.runs}</Text>
                        <Text style={[styles.tableCell, { color: '#ef4444', fontWeight: 'bold' }]}>{s.wickets}</Text>
                        <Text style={styles.tableCell}>
                          {s.balls > 0 ? (s.runs / (s.balls / 6)).toFixed(1) : '0.0'}
                        </Text>
                      </View>
                    ))}
                </View>
              </>
          }
        </View>
      )}

      {/* EXTRAS TAB */}
      {activeTab === 'extras' && (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Extras breakdown</Text>
          <BarChart
            data={[extras.dot, extras.wide, extras.noBall, extras.bye]}
            labels={['Dots', 'Wides', 'No Balls', 'Byes']}
            colors={['#334155', '#f59e0b', '#ef4444', '#38bdf8']}
            maxVal={Math.max(extras.dot, extras.wide, extras.noBall, extras.bye, 1)}
            height={120}
          />
          <View style={styles.extrasGrid}>
            {[
              { label: 'Dot balls', val: extras.dot, color: '#64748b' },
              { label: 'Wides', val: extras.wide, color: '#f59e0b' },
              { label: 'No balls', val: extras.noBall, color: '#ef4444' },
              { label: 'Byes', val: extras.bye, color: '#38bdf8' },
              { label: 'Total extras', val: totalExtras, color: '#a855f7' },
              { label: 'Total balls', val: match.balls || 0, color: '#22c55e' },
            ].map(({ label, val, color }) => (
              <View key={label} style={styles.extraCard}>
                <Text style={[styles.extraVal, { color }]}>{val}</Text>
                <Text style={styles.extraLabel}>{label}</Text>
              </View>
            ))}
          </View>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  title: { fontSize: 24, color: '#fff', fontWeight: 'bold', textAlign: 'center', marginBottom: 16 },
  emptyContainer: { flex: 1, backgroundColor: '#0f172a', justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  emptySubtitle: { color: '#475569', fontSize: 14, textAlign: 'center', lineHeight: 22 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginBottom: 16 },
  statCard: { flex: 1, minWidth: '44%', backgroundColor: '#1e293b', borderRadius: 12, padding: 12 },
  statLabel: { color: '#64748b', fontSize: 11, marginBottom: 4 },
  statVal: { color: '#fff', fontSize: 16, fontWeight: 'bold' },
  tabBar: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 12, padding: 4, marginBottom: 14, gap: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#38bdf8' },
  tabText: { color: '#64748b', fontSize: 12, fontWeight: '600' },
  tabTextActive: { color: '#0f172a', fontWeight: 'bold' },
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 14 },
  cardTitle: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold', marginBottom: 14, textTransform: 'uppercase', letterSpacing: 0.5 },
  noData: { color: '#475569', fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  tableWrap: { marginTop: 20, borderRadius: 8, overflow: 'hidden' },
  tableRow: { flexDirection: 'row', paddingVertical: 7, paddingHorizontal: 6 },
  tableHead: { flex: 1, color: '#64748b', fontSize: 11, fontWeight: 'bold' },
  tableCell: { flex: 1, color: '#e2e8f0', fontSize: 12 },
  extrasGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 20 },
  extraCard: { flex: 1, minWidth: '28%', backgroundColor: '#0f172a', borderRadius: 10, padding: 12, alignItems: 'center' },
  extraVal: { fontSize: 24, fontWeight: 'bold' },
  extraLabel: { color: '#64748b', fontSize: 11, marginTop: 4 },
});