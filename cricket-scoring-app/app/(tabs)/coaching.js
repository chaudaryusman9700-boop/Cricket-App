import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { getFullCoaching } from '../../api';

export default function CoachingScreen() {
  const [matchData, setMatchData] = useState(null);
  const [tips, setTips] = useState(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('batting');
  const [lastUpdated, setLastUpdated] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadMatchData();
    }, [])
  );

  const loadMatchData = async () => {
    try {
      const data = await AsyncStorage.getItem('currentMatch');
      if (data) setMatchData(JSON.parse(data));
    } catch (e) { console.log(e); }
  };

  // ── Analyze match data and generate tips ──
  const analyzeMatch = () => {
    if (!matchData) return null;
    const match = matchData.match || matchData;
    const bStats = matchData.batsmenStats || {};
    const bwStats = matchData.bowlerStats || {};
    const ballHistory = [...(match.ballHistory || [])].reverse();

    // ── Batting Analysis ──
    const totalBalls = match.balls || 0;
    const totalRuns = match.runs || 0;
    const wickets = match.wickets || 0;
    const runRate = totalBalls > 0 ? (totalRuns / (totalBalls / 6)).toFixed(2) : 0;
    const totalOvers = match.totalOvers || 10;
    const ballsLeft = (totalOvers * 6) - totalBalls;
    const oversLeft = (ballsLeft / 6).toFixed(1);

    // Dot ball percentage
    const dotBalls = ballHistory.filter(b => b.type === 'dot').length;
    const dotPct = totalBalls > 0 ? Math.round((dotBalls / totalBalls) * 100) : 0;

    // Boundary count
    const fours = ballHistory.filter(b => b.run === 4 && b.type === 'run').length;
    const sixes = ballHistory.filter(b => b.run === 6 && b.type === 'run').length;

    // Top batsman strike rate
    const topBat = Object.entries(bStats).sort((a, b) => b[1].runs - a[1].runs)[0];
    const topBatSR = topBat && topBat[1].balls > 0
      ? ((topBat[1].runs / topBat[1].balls) * 100).toFixed(0) : 0;

    // ── Bowling Analysis ──
    const wides = ballHistory.filter(b => ['wide','wideRun','wideBoundary'].includes(b.type)).length;
    const noBalls = ballHistory.filter(b => ['noBall','noBallRun'].includes(b.type)).length;
    const extras = wides + noBalls;

    // Current bowler economy
    const currentBowler = match.bowler;
    const bowlerData = bwStats[currentBowler];
    const bowlerEco = bowlerData && bowlerData.balls > 0
      ? (bowlerData.runs / (bowlerData.balls / 6)).toFixed(1) : null;

    // Most expensive bowler
    const expensiveBowler = Object.entries(bwStats)
      .filter(([_, s]) => s.balls >= 6)
      .sort((a, b) => (b[1].runs / (b[1].balls / 6)) - (a[1].runs / (a[1].balls / 6)))[0];

    // Best bowler
    const bestBowler = Object.entries(bwStats)
      .filter(([_, s]) => s.wickets > 0)
      .sort((a, b) => b[1].wickets - a[1].wickets)[0];

    return {
      match, bStats, bwStats, ballHistory,
      runRate, dotPct, fours, sixes, wickets, ballsLeft, oversLeft,
      topBat, topBatSR, wides, noBalls, extras,
      currentBowler, bowlerEco, expensiveBowler, bestBowler,
      totalOvers, totalBalls, totalRuns,
    };
  };

  // ── Generate tips using your trained Python ML model (via Node backend) ──
  // The Flask/scikit-learn service expects the raw match snapshot —
  // it builds its own features (strike rate, dot %, economy, etc.) from this.
  const getTips = async () => {
    setLoading(true);
    setTips(null);
    try {
      const analysis = analyzeMatch();
      if (!analysis) {
        setTips({ error: 'No match data found. Start scoring a match first.' });
        setLoading(false);
        return;
      }

      const { match, bStats, bwStats, wickets, ballsLeft, totalBalls, totalRuns } = analysis;
      const overNum = Math.floor(totalBalls / 6);
      const runsNeeded = match.target ? Math.max(match.target - totalRuns, 0) : 0;

      // Same raw snapshot works for both batting and bowling —
      // the Python service pulls out whichever fields it needs.
      const payload = {
        ballHistory: match.ballHistory || [],
        striker: match.striker,
        batsmenStats: bStats,
        bowler: match.bowler,
        bowlerStats: bwStats,
        overNum,
        wickets,
        runsNeeded,
        ballsLeft,
        totalBalls,
      };

      const result = await getFullCoaching(payload, payload);

      if (!result.success) {
        setTips({ error: result.error || 'Could not reach AI Coach service.' });
        setLoading(false);
        return;
      }

      if (result.batting?.error || result.bowling?.error) {
        setTips({ error: result.batting?.error || result.bowling?.error });
        setLoading(false);
        return;
      }

      // ── Normalize ML response into the tips UI shape ──
      const battingTips = (result.batting?.all_tips || []).map((t, i) => ({
        title: i === 0 ? result.batting.title : `Tip ${i + 1}`,
        tip: t,
        priority: i === 0 ? 'high' : 'medium',
        icon: '🏏',
      }));

      const bowlingTips = (result.bowling?.all_tips || []).map((t, i) => ({
        title: i === 0 ? result.bowling.title : `Tip ${i + 1}`,
        tip: t,
        priority: i === 0 ? 'high' : 'medium',
        icon: '🎯',
      }));

      setTips({
        battingTips,
        bowlingTips,
        matchSituation: `${match.battingTeam || 'Batting team'} at ${totalRuns}/${wickets}${runsNeeded ? `, need ${runsNeeded} more` : ''}.`,
        keyInsight: result.batting?.tip || battingTips[0]?.tip || '',
      });
      setLastUpdated(new Date().toLocaleTimeString());
    } catch (e) {
      console.error('AI coaching error:', e);
      setTips({ error: 'Could not generate tips. Make sure the AI Coach backend is running.' });
    }
    setLoading(false);
  };

  const priorityColor = (p) => {
    if (p === 'high') return '#ef4444';
    if (p === 'medium') return '#f59e0b';
    return '#22c55e';
  };

  const analysis = analyzeMatch();

  return (
    <ScrollView style={styles.container}>
      <Text style={styles.title}>🧠 AI Coach</Text>

      {/* Match snapshot */}
      {analysis ? (
        <View style={styles.snapshotCard}>
          <Text style={styles.snapshotTitle}>Current Match</Text>
          <View style={styles.snapshotRow}>
            <View style={styles.snapshotItem}>
              <Text style={styles.snapshotVal}>{analysis.totalRuns}/{analysis.wickets}</Text>
              <Text style={styles.snapshotLabel}>Score</Text>
            </View>
            <View style={styles.snapshotItem}>
              <Text style={styles.snapshotVal}>{analysis.runRate}</Text>
              <Text style={styles.snapshotLabel}>Run Rate</Text>
            </View>
            <View style={styles.snapshotItem}>
              <Text style={styles.snapshotVal}>{analysis.dotPct}%</Text>
              <Text style={styles.snapshotLabel}>Dot Balls</Text>
            </View>
            <View style={styles.snapshotItem}>
              <Text style={styles.snapshotVal}>{analysis.oversLeft}</Text>
              <Text style={styles.snapshotLabel}>Overs Left</Text>
            </View>
          </View>
        </View>
      ) : (
        <View style={styles.emptyCard}>
          <Text style={styles.emptyIcon}>🏏</Text>
          <Text style={styles.emptyTitle}>No match in progress</Text>
          <Text style={styles.emptySubtitle}>Start scoring a match to get AI coaching tips</Text>
        </View>
      )}

      {/* Get tips button */}
      <TouchableOpacity
        style={[styles.analyzeBtn, loading && { opacity: 0.7 }]}
        onPress={getTips}
        disabled={loading || !analysis}
      >
        {loading ? (
          <View style={{ flexDirection: 'row', gap: 10, alignItems: 'center' }}>
            <ActivityIndicator color="#0f172a" />
            <Text style={styles.analyzeBtnText}>Analyzing match...</Text>
          </View>
        ) : (
          <Text style={styles.analyzeBtnText}>
            {tips ? '🔄 Refresh Tips' : '🧠 Get AI Coaching Tips'}
          </Text>
        )}
      </TouchableOpacity>

      {lastUpdated && (
        <Text style={styles.updatedText}>Last updated: {lastUpdated}</Text>
      )}

      {/* Error */}
      {tips?.error && (
        <View style={styles.errorCard}>
          <Text style={styles.errorText}>{tips.error}</Text>
        </View>
      )}

      {/* Key insight */}
      {tips?.keyInsight && (
        <View style={styles.insightCard}>
          <Text style={styles.insightLabel}>💡 KEY INSIGHT</Text>
          <Text style={styles.insightText}>{tips.keyInsight}</Text>
        </View>
      )}

      {/* Match situation */}
      {tips?.matchSituation && (
        <View style={styles.situationCard}>
          <Text style={styles.situationText}>📊 {tips.matchSituation}</Text>
        </View>
      )}

      {/* Tabs */}
      {tips && !tips.error && (
        <>
          <View style={styles.tabBar}>
            {[
              { key: 'batting', label: '🏏 Batting Tips' },
              { key: 'bowling', label: '🎳 Bowling Tips' },
            ].map(t => (
              <TouchableOpacity
                key={t.key}
                style={[styles.tab, activeTab === t.key && styles.tabActive]}
                onPress={() => setActiveTab(t.key)}
              >
                <Text style={[styles.tabText, activeTab === t.key && styles.tabTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Batting tips */}
          {activeTab === 'batting' && (tips.battingTips || []).map((tip, i) => (
            <View key={i} style={styles.tipCard}>
              <View style={styles.tipHeader}>
                <Text style={styles.tipIcon}>{tip.icon}</Text>
                <Text style={styles.tipTitle}>{tip.title}</Text>
                <View style={[styles.priorityBadge, { backgroundColor: priorityColor(tip.priority) + '33' }]}>
                  <Text style={[styles.priorityText, { color: priorityColor(tip.priority) }]}>
                    {tip.priority?.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.tipBody}>{tip.tip}</Text>
            </View>
          ))}

          {/* Bowling tips */}
          {activeTab === 'bowling' && (tips.bowlingTips || []).map((tip, i) => (
            <View key={i} style={styles.tipCard}>
              <View style={styles.tipHeader}>
                <Text style={styles.tipIcon}>{tip.icon}</Text>
                <Text style={styles.tipTitle}>{tip.title}</Text>
                <View style={[styles.priorityBadge, { backgroundColor: priorityColor(tip.priority) + '33' }]}>
                  <Text style={[styles.priorityText, { color: priorityColor(tip.priority) }]}>
                    {tip.priority?.toUpperCase()}
                  </Text>
                </View>
              </View>
              <Text style={styles.tipBody}>{tip.tip}</Text>
            </View>
          ))}
        </>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  title: { fontSize: 24, color: '#fff', fontWeight: 'bold', marginBottom: 16 },

  snapshotCard: { backgroundColor: '#1e293b', borderRadius: 14, padding: 14, marginBottom: 14 },
  snapshotTitle: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1, marginBottom: 10 },
  snapshotRow: { flexDirection: 'row', justifyContent: 'space-between' },
  snapshotItem: { alignItems: 'center' },
  snapshotVal: { color: '#38bdf8', fontSize: 20, fontWeight: 'bold' },
  snapshotLabel: { color: '#64748b', fontSize: 11, marginTop: 2 },

  emptyCard: { backgroundColor: '#1e293b', borderRadius: 14, padding: 24, alignItems: 'center', marginBottom: 14 },
  emptyIcon: { fontSize: 36, marginBottom: 8 },
  emptyTitle: { color: '#fff', fontWeight: 'bold', fontSize: 16, marginBottom: 4 },
  emptySubtitle: { color: '#475569', fontSize: 13, textAlign: 'center' },

  analyzeBtn: { backgroundColor: '#38bdf8', padding: 16, borderRadius: 12, alignItems: 'center', marginBottom: 8 },
  analyzeBtnText: { color: '#0f172a', fontWeight: 'bold', fontSize: 15 },
  updatedText: { color: '#475569', fontSize: 12, textAlign: 'center', marginBottom: 14 },

  errorCard: { backgroundColor: '#7f1d1d', borderRadius: 12, padding: 14, marginBottom: 14 },
  errorText: { color: '#fca5a5', fontSize: 13 },

  insightCard: { backgroundColor: '#1a3a1a', borderRadius: 12, padding: 14, marginBottom: 10, borderWidth: 1, borderColor: '#22c55e' },
  insightLabel: { color: '#22c55e', fontSize: 11, fontWeight: 'bold', marginBottom: 6 },
  insightText: { color: '#fff', fontSize: 14, lineHeight: 20 },

  situationCard: { backgroundColor: '#1e3a5f', borderRadius: 12, padding: 12, marginBottom: 14 },
  situationText: { color: '#93c5fd', fontSize: 13, lineHeight: 18 },

  tabBar: { flexDirection: 'row', backgroundColor: '#1e293b', borderRadius: 12, padding: 4, marginBottom: 12, gap: 4 },
  tab: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#38bdf8' },
  tabText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#0f172a', fontWeight: 'bold' },

  tipCard: { backgroundColor: '#1e293b', borderRadius: 14, padding: 14, marginBottom: 10 },
  tipHeader: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  tipIcon: { fontSize: 20 },
  tipTitle: { flex: 1, color: '#fff', fontWeight: 'bold', fontSize: 14 },
  priorityBadge: { paddingHorizontal: 8, paddingVertical: 3, borderRadius: 20 },
  priorityText: { fontSize: 10, fontWeight: 'bold' },
  tipBody: { color: '#94a3b8', fontSize: 13, lineHeight: 20 },
});