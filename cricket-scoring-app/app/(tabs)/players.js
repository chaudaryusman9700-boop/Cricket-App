import React, { useState, useCallback } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, RefreshControl, Modal, Alert
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { fetchPlayers, fetchPlayerStats } from '../../api';

export default function PlayersScreen() {
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPlayer, setSelectedPlayer] = useState(null);
  const [playerDetail, setPlayerDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('batting');

  useFocusEffect(
    useCallback(() => {
      loadPlayers();
    }, [])
  );

  const loadPlayers = async () => {
    setLoading(true);
    const result = await fetchPlayers();
    if (result.success) {
      setPlayers(result.players);
    } else {
      Alert.alert('Error', 'Could not load players. Make sure backend is running.');
    }
    setLoading(false);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadPlayers();
    setRefreshing(false);
  };

  const openPlayer = async (name) => {
    setSelectedPlayer(name);
    setDetailLoading(true);
    const result = await fetchPlayerStats(name);
    if (result.success) {
      setPlayerDetail(result.player);
    } else {
      setPlayerDetail(null);
    }
    setDetailLoading(false);
  };

  // ── Stat badge ──
  const StatBadge = ({ label, value, color }) => (
    <View style={styles.statBadge}>
      <Text style={[styles.statBadgeVal, { color: color || '#fff' }]}>{value}</Text>
      <Text style={styles.statBadgeLabel}>{label}</Text>
    </View>
  );

  // ── Player detail modal ──
  const PlayerModal = () => {
    if (!selectedPlayer) return null;
    const p = playerDetail;

    return (
      <Modal visible={true} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Header */}
              <View style={styles.playerModalHeader}>
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerAvatarText}>
                    {selectedPlayer.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.playerModalName}>{selectedPlayer}</Text>
                {p && <Text style={styles.playerModalMatches}>{p.matches} matches played</Text>}
              </View>

              {detailLoading && (
                <Text style={styles.loadingText}>Loading stats...</Text>
              )}

              {!detailLoading && !p && (
                <Text style={styles.noData}>No stats available</Text>
              )}

              {!detailLoading && p && (
                <>
                  {/* Career stats grid */}
                  <View style={styles.statsGrid}>
                    <StatBadge label="Total Runs" value={p.totalRuns} color="#38bdf8" />
                    <StatBadge label="Wickets" value={p.totalWickets} color="#ef4444" />
                    <StatBadge label="Highest" value={p.highestScore} color="#f59e0b" />
                    <StatBadge label="Avg" value={p.battingAvg} color="#22c55e" />
                    <StatBadge label="SR" value={p.strikeRate} color="#a855f7" />
                    <StatBadge label="Matches" value={p.matches} color="#64748b" />
                  </View>

                  {/* Tab bar */}
                  <View style={styles.tabBar}>
                    {['batting', 'history'].map(t => (
                      <TouchableOpacity key={t}
                        style={[styles.tab, activeTab === t && styles.tabActive]}
                        onPress={() => setActiveTab(t)}>
                        <Text style={[styles.tabText, activeTab === t && styles.tabTextActive]}>
                          {t === 'batting' ? 'Career' : 'Match History'}
                        </Text>
                      </TouchableOpacity>
                    ))}
                  </View>

                  {/* Career tab */}
                  {activeTab === 'batting' && (
                    <View style={styles.careerCard}>
                      {[
                        ['Total runs scored', p.totalRuns, '#38bdf8'],
                        ['Total balls faced', p.totalBalls, '#94a3b8'],
                        ['Total wickets taken', p.totalWickets, '#ef4444'],
                        ['Highest score', p.highestScore, '#f59e0b'],
                        ['Batting average', p.battingAvg, '#22c55e'],
                        ['Strike rate', p.strikeRate, '#a855f7'],
                        ['Matches played', p.matches, '#64748b'],
                      ].map(([label, val, color]) => (
                        <View key={label} style={styles.careerRow}>
                          <Text style={styles.careerLabel}>{label}</Text>
                          <Text style={[styles.careerVal, { color }]}>{val}</Text>
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Match history tab */}
                  {activeTab === 'history' && (
                    <View>
                      {(!p.matchHistory || p.matchHistory.length === 0) && (
                        <Text style={styles.noData}>No match history yet</Text>
                      )}
                      {(p.matchHistory || []).map((m, i) => (
                        <View key={i} style={styles.historyCard}>
                          <View style={styles.historyHeader}>
                            <Text style={styles.historyTeam}>{m.battingTeam || 'Match ' + (i + 1)}</Text>
                            <Text style={styles.historyDate}>{m.matchDate || '—'}</Text>
                          </View>
                          {m.venue ? <Text style={styles.historyVenue}>📍 {m.venue}</Text> : null}
                          <View style={styles.historyStats}>
                            <View style={styles.historyStatItem}>
                              <Text style={styles.historyStatVal}>{m.runs}</Text>
                              <Text style={styles.historyStatLabel}>Runs</Text>
                            </View>
                            <View style={styles.historyStatItem}>
                              <Text style={styles.historyStatVal}>{m.balls}</Text>
                              <Text style={styles.historyStatLabel}>Balls</Text>
                            </View>
                            <View style={styles.historyStatItem}>
                              <Text style={[styles.historyStatVal, { color: '#ef4444' }]}>{m.wickets}</Text>
                              <Text style={styles.historyStatLabel}>Wickets</Text>
                            </View>
                            <View style={styles.historyStatItem}>
                              <Text style={[styles.historyStatVal, { color: '#22c55e' }]}>
                                {m.balls > 0 ? ((m.runs / m.balls) * 100).toFixed(0) : '0'}
                              </Text>
                              <Text style={styles.historyStatLabel}>SR</Text>
                            </View>
                          </View>
                        </View>
                      ))}
                    </View>
                  )}
                </>
              )}

              <TouchableOpacity style={styles.btnClose}
                onPress={() => { setSelectedPlayer(null); setPlayerDetail(null); }}>
                <Text style={styles.btnCloseText}>Close</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // ── Sort players by runs ──
  const battingLeaders = [...players].sort((a, b) => b.totalRuns - a.totalRuns);
  const bowlingLeaders = [...players].sort((a, b) => b.totalWickets - a.totalWickets);

  return (
    <View style={styles.container}>
      <PlayerModal />

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />}
        contentContainerStyle={players.length === 0 && !loading && styles.emptyContainer}
      >
        <Text style={styles.title}>Players</Text>

        {loading && (
          <Text style={styles.loadingText}>Loading players...</Text>
        )}

        {!loading && players.length === 0 && (
          <View style={styles.emptyState}>
            <Text style={styles.emptyIcon}>👤</Text>
            <Text style={styles.emptyTitle}>No players yet</Text>
            <Text style={styles.emptySubtitle}>
              Save a match first to see player career stats here.{'\n'}
              Make sure your backend is running.
            </Text>
          </View>
        )}

        {!loading && players.length > 0 && (
          <>
            {/* ── Top Batting ── */}
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>🏏 Batting Leaders</Text>
            </View>
            {battingLeaders.map((p, i) => (
              <TouchableOpacity key={p.name} style={styles.playerCard}
                onPress={() => openPlayer(p.name)}>
                <View style={styles.playerRank}>
                  <Text style={styles.rankNum}>{i + 1}</Text>
                </View>
                <View style={styles.playerAvatar}>
                  <Text style={styles.playerAvatarText}>
                    {p.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>{p.name}</Text>
                  <Text style={styles.playerMeta}>{p.matches} matches · Avg {p.battingAvg} · SR {p.strikeRate}</Text>
                </View>
                <View style={styles.playerScore}>
                  <Text style={styles.playerRuns}>{p.totalRuns}</Text>
                  <Text style={styles.playerRunsLabel}>runs</Text>
                </View>
              </TouchableOpacity>
            ))}

            {/* ── Top Bowling ── */}
            <View style={[styles.sectionHeader, { marginTop: 20 }]}>
              <Text style={styles.sectionTitle}>🎳 Bowling Leaders</Text>
            </View>
            {bowlingLeaders.filter(p => p.totalWickets > 0).map((p, i) => (
              <TouchableOpacity key={p.name + 'b'} style={styles.playerCard}
                onPress={() => openPlayer(p.name)}>
                <View style={styles.playerRank}>
                  <Text style={styles.rankNum}>{i + 1}</Text>
                </View>
                <View style={[styles.playerAvatar, { backgroundColor: '#7f1d1d' }]}>
                  <Text style={styles.playerAvatarText}>
                    {p.name.charAt(0).toUpperCase()}
                  </Text>
                </View>
                <View style={styles.playerInfo}>
                  <Text style={styles.playerName}>{p.name}</Text>
                  <Text style={styles.playerMeta}>{p.matches} matches · Best: {p.bestBowling || p.totalWickets}w</Text>
                </View>
                <View style={styles.playerScore}>
                  <Text style={[styles.playerRuns, { color: '#ef4444' }]}>{p.totalWickets}</Text>
                  <Text style={styles.playerRunsLabel}>wickets</Text>
                </View>
              </TouchableOpacity>
            ))}

            {bowlingLeaders.filter(p => p.totalWickets > 0).length === 0 && (
              <Text style={styles.noData}>No wickets recorded yet</Text>
            )}
          </>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 16, paddingTop: 16 },
  title: { fontSize: 24, color: '#fff', fontWeight: 'bold', marginBottom: 16 },

  loadingText: { color: '#64748b', textAlign: 'center', padding: 20, fontSize: 14 },
  noData: { color: '#475569', fontSize: 13, textAlign: 'center', padding: 16 },

  emptyContainer: { flex: 1, justifyContent: 'center' },
  emptyState: { alignItems: 'center', paddingVertical: 60 },
  emptyIcon: { fontSize: 48, marginBottom: 16 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  emptySubtitle: { color: '#475569', fontSize: 14, textAlign: 'center', lineHeight: 22 },

  sectionHeader: { marginBottom: 10 },
  sectionTitle: { color: '#94a3b8', fontSize: 12, fontWeight: 'bold', textTransform: 'uppercase', letterSpacing: 1 },

  // Player card
  playerCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: '#1e293b', borderRadius: 14,
    padding: 12, marginBottom: 8, gap: 10,
  },
  playerRank: { width: 20, alignItems: 'center' },
  rankNum: { color: '#475569', fontSize: 13, fontWeight: 'bold' },
  playerAvatar: {
    width: 40, height: 40, borderRadius: 20,
    backgroundColor: '#1d4ed8', justifyContent: 'center', alignItems: 'center',
  },
  playerAvatarText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
  playerInfo: { flex: 1 },
  playerName: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  playerMeta: { color: '#64748b', fontSize: 12, marginTop: 2 },
  playerScore: { alignItems: 'flex-end' },
  playerRuns: { color: '#38bdf8', fontSize: 20, fontWeight: 'bold' },
  playerRunsLabel: { color: '#64748b', fontSize: 11 },

  // Modal
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: {
    backgroundColor: '#1e293b', borderTopLeftRadius: 24,
    borderTopRightRadius: 24, padding: 20, maxHeight: '90%',
  },
  playerModalHeader: { alignItems: 'center', marginBottom: 20 },
  playerModalName: { color: '#fff', fontSize: 22, fontWeight: 'bold', marginTop: 10 },
  playerModalMatches: { color: '#64748b', fontSize: 13, marginTop: 4 },

  statsGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 16 },
  statBadge: { flex: 1, minWidth: '30%', backgroundColor: '#0f172a', borderRadius: 10, padding: 10, alignItems: 'center' },
  statBadgeVal: { fontSize: 20, fontWeight: 'bold' },
  statBadgeLabel: { color: '#64748b', fontSize: 11, marginTop: 2 },

  tabBar: { flexDirection: 'row', backgroundColor: '#0f172a', borderRadius: 10, padding: 4, marginBottom: 14, gap: 4 },
  tab: { flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: 'center' },
  tabActive: { backgroundColor: '#38bdf8' },
  tabText: { color: '#64748b', fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: '#0f172a', fontWeight: 'bold' },

  careerCard: { backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 12 },
  careerRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#1e293b' },
  careerLabel: { color: '#64748b', fontSize: 13 },
  careerVal: { fontSize: 13, fontWeight: 'bold' },

  historyCard: { backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginBottom: 8 },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  historyTeam: { color: '#38bdf8', fontWeight: 'bold', fontSize: 13 },
  historyDate: { color: '#475569', fontSize: 12 },
  historyVenue: { color: '#475569', fontSize: 11, marginBottom: 8 },
  historyStats: { flexDirection: 'row', justifyContent: 'space-around' },
  historyStatItem: { alignItems: 'center' },
  historyStatVal: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
  historyStatLabel: { color: '#64748b', fontSize: 11, marginTop: 2 },

  btnClose: { backgroundColor: '#334155', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  btnCloseText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});