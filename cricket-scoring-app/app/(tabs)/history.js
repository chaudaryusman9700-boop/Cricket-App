import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Alert, RefreshControl, Modal
} from 'react-native';
import { useFocusEffect } from 'expo-router';

export default function MatchHistory() {
  const [matches, setMatches] = useState([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedMatch, setSelectedMatch] = useState(null);

  // ── Load every time screen is focused ──
  useFocusEffect(
    useCallback(() => {
      loadHistory();
    }, [])
  );

  const loadHistory = async () => {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const matchKeys = keys.filter(k => k.startsWith('match_'));
      if (matchKeys.length === 0) { setMatches([]); return; }
      const pairs = await AsyncStorage.multiGet(matchKeys);
      const loaded = pairs
        .map(([key, val]) => {
          try { return { key, ...JSON.parse(val) }; }
          catch { return null; }
        })
        .filter(Boolean)
        .sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      setMatches(loaded);
    } catch (e) {
      console.log(e);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadHistory();
    setRefreshing(false);
  };

  const deleteMatch = (key, label) => {
    Alert.alert('Delete Match', `Remove "${label}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive', onPress: async () => {
          await AsyncStorage.removeItem(key);
          setMatches(prev => prev.filter(m => m.key !== key));
        }
      }
    ]);
  };

  const clearAll = () => {
    Alert.alert('Clear All', 'Delete all match history?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Clear All', style: 'destructive', onPress: async () => {
          const keys = matches.map(m => m.key);
          await AsyncStorage.multiRemove(keys);
          setMatches([]);
        }
      }
    ]);
  };

  const formatDate = (ts) => {
    if (!ts) return '—';
    const d = new Date(ts);
    return d.toLocaleDateString([], { day: '2-digit', month: 'short', year: 'numeric' }) +
      '  ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const getResult = (m) => {
    const match = m.match || m;
    if (!match) return '—';
    return `${match.runs || 0}/${match.wickets || 0} in ${Math.floor((match.balls || 0) / 6)}.${(match.balls || 0) % 6} ov`;
  };

  const getWinner = (m) => {
    const match = m.match || m;
    if (!match || !match.battingTeam) return null;
    return match.battingTeam;
  };

  // ── Detail Modal ──
  const DetailModal = () => {
    if (!selectedMatch) return null;
    const match = selectedMatch.match || selectedMatch;
    const bStats = selectedMatch.batsmenStats || {};
    const bwStats = selectedMatch.bowlerStats || {};

    return (
      <Modal visible={true} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>
              <Text style={styles.modalTitle}>Match Details</Text>

              {/* Score */}
              <View style={styles.detailScoreCard}>
                <Text style={styles.detailScore}>{match.runs}/{match.wickets}</Text>
                <Text style={styles.detailOvers}>
                  {Math.floor(match.balls / 6)}.{match.balls % 6} / {match.totalOvers || '?'} overs
                </Text>
                {match.battingTeam && <Text style={styles.detailTeam}>{match.battingTeam}</Text>}
                {match.venue ? <Text style={styles.detailVenue}>{match.venue}</Text> : null}
                {selectedMatch.savedAt
                  ? <Text style={styles.detailVenue}>{formatDate(selectedMatch.savedAt)}</Text>
                  : null}
              </View>

              {/* Batting */}
              {Object.keys(bStats).length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Batting</Text>
                  <View style={styles.tableRow}>
                    <Text style={[styles.tableHead, { flex: 2 }]}>Player</Text>
                    <Text style={styles.tableHead}>R</Text>
                    <Text style={styles.tableHead}>B</Text>
                    <Text style={styles.tableHead}>SR</Text>
                  </View>
                  {Object.entries(bStats).map(([p, s], i) => (
                    <View key={i} style={styles.tableRow}>
                      <Text style={[styles.tableCell, { flex: 2 }]}>{p}</Text>
                      <Text style={styles.tableCell}>{s.runs}</Text>
                      <Text style={styles.tableCell}>{s.balls}</Text>
                      <Text style={styles.tableCell}>
                        {s.balls > 0 ? ((s.runs / s.balls) * 100).toFixed(1) : '0.0'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* Bowling */}
              {Object.keys(bwStats).length > 0 && (
                <View style={styles.detailSection}>
                  <Text style={styles.detailSectionTitle}>Bowling</Text>
                  <View style={styles.tableRow}>
                    <Text style={[styles.tableHead, { flex: 2 }]}>Bowler</Text>
                    <Text style={styles.tableHead}>O</Text>
                    <Text style={styles.tableHead}>R</Text>
                    <Text style={styles.tableHead}>W</Text>
                    <Text style={styles.tableHead}>Eco</Text>
                  </View>
                  {Object.entries(bwStats).map(([b, s], i) => (
                    <View key={i} style={styles.tableRow}>
                      <Text style={[styles.tableCell, { flex: 2 }]}>{b}</Text>
                      <Text style={styles.tableCell}>{(s.balls / 6).toFixed(1)}</Text>
                      <Text style={styles.tableCell}>{s.runs}</Text>
                      <Text style={styles.tableCell}>{s.wickets}</Text>
                      <Text style={styles.tableCell}>
                        {s.balls > 0 ? (s.runs / (s.balls / 6)).toFixed(1) : '0.0'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              <TouchableOpacity style={styles.btnClose} onPress={() => setSelectedMatch(null)}>
                <Text style={styles.btnCloseText}>Close</Text>
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  return (
    <View style={styles.container}>
      <DetailModal />

      <View style={styles.header}>
        <Text style={styles.title}>Match History</Text>
        {matches.length > 0 && (
          <TouchableOpacity onPress={clearAll}>
            <Text style={styles.clearBtn}>Clear all</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />}
        contentContainerStyle={matches.length === 0 && styles.emptyContainer}
      >
        {matches.length === 0 ? (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>🏏</Text>
            <Text style={styles.emptyTitle}>No matches yet</Text>
            <Text style={styles.emptySubtitle}>
              Saved matches will appear here.{'\n'}
              Tap "Save Match" during scoring to record a match.
            </Text>
          </View>
        ) : (
          matches.map((m, i) => {
            const match = m.match || m;
            return (
              <TouchableOpacity
                key={m.key}
                style={styles.matchCard}
                onPress={() => setSelectedMatch(m)}
                onLongPress={() => deleteMatch(m.key, match.battingTeam || `Match ${i + 1}`)}
                activeOpacity={0.75}
              >
                {/* Card header */}
                <View style={styles.cardHeader}>
                  <View style={styles.cardTeamBadge}>
                    <Text style={styles.cardTeamText}>{match.battingTeam || 'Match ' + (i + 1)}</Text>
                  </View>
                  <Text style={styles.cardDate}>{formatDate(m.savedAt)}</Text>
                </View>

                {/* Score row */}
                <View style={styles.cardScoreRow}>
                  <Text style={styles.cardScore}>{match.runs}/{match.wickets}</Text>
                  <Text style={styles.cardOvers}>
                    {Math.floor((match.balls || 0) / 6)}.{(match.balls || 0) % 6} ov
                    {match.totalOvers ? ` / ${match.totalOvers}` : ''}
                  </Text>
                </View>

                {/* Footer */}
                <View style={styles.cardFooter}>
                  {match.venue ? (
                    <Text style={styles.cardVenue}>{match.venue}</Text>
                  ) : (
                    <Text style={styles.cardVenue}>No venue recorded</Text>
                  )}
                  <Text style={styles.cardHint}>Tap to view · Hold to delete</Text>
                </View>
              </TouchableOpacity>
            );
          })
        )}
        <View style={{ height: 30 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 16, paddingTop: 16 },

  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 24, color: '#fff', fontWeight: 'bold' },
  clearBtn: { color: '#ef4444', fontSize: 13 },

  // Match card
  matchCard: {
    backgroundColor: '#1e293b', borderRadius: 14,
    padding: 14, marginBottom: 12,
    borderWidth: 0.5, borderColor: '#334155',
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardTeamBadge: { backgroundColor: '#0f172a', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20 },
  cardTeamText: { color: '#38bdf8', fontSize: 12, fontWeight: 'bold' },
  cardDate: { color: '#475569', fontSize: 11 },
  cardScoreRow: { flexDirection: 'row', alignItems: 'baseline', gap: 10, marginBottom: 10 },
  cardScore: { fontSize: 36, fontWeight: 'bold', color: '#38bdf8' },
  cardOvers: { fontSize: 14, color: '#94a3b8' },
  cardFooter: { flexDirection: 'row', justifyContent: 'space-between', borderTopWidth: 0.5, borderTopColor: '#334155', paddingTop: 8 },
  cardVenue: { color: '#64748b', fontSize: 12 },
  cardHint: { color: '#334155', fontSize: 11 },

  // Empty state
  emptyContainer: { flex: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  emptySubtitle: { color: '#475569', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  // Detail modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    padding: 20, maxHeight: '85%',
  },
  modalTitle: { color: '#fff', fontWeight: 'bold', fontSize: 18, marginBottom: 16, textAlign: 'center' },
  detailScoreCard: { backgroundColor: '#0f172a', borderRadius: 12, padding: 16, alignItems: 'center', marginBottom: 16 },
  detailScore: { fontSize: 42, fontWeight: 'bold', color: '#38bdf8' },
  detailOvers: { color: '#94a3b8', fontSize: 14, marginTop: 4 },
  detailTeam: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginTop: 6 },
  detailVenue: { color: '#475569', fontSize: 12, marginTop: 2 },
  detailSection: { marginBottom: 16 },
  detailSectionTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 8 },
  tableRow: { flexDirection: 'row', paddingVertical: 5, borderBottomWidth: 0.5, borderBottomColor: '#1e293b' },
  tableHead: { flex: 1, color: '#64748b', fontSize: 12, fontWeight: 'bold' },
  tableCell: { flex: 1, color: '#e2e8f0', fontSize: 13 },
  btnClose: { backgroundColor: '#334155', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  btnCloseText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});