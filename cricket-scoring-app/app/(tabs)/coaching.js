import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { fetchBattingCoach, fetchBowlingCoach, fetchFullCoach } from '../../api';

const samplePayload = {
  striker: 'Babar Azam',
  bowler: 'Shaheen Afridi',
  overNum: 8,
  wickets: 2,
  runsNeeded: 72,
  ballsLeft: 48,
  totalBalls: 120,
  batsmenStats: {
    'Babar Azam': { runs: 34, balls: 26 },
  },
  bowlerStats: {
    'Shaheen Afridi': { runs: 18, balls: 18, wickets: 1 },
  },
  ballHistory: [
    { striker: 'Babar Azam', bowler: 'Shaheen Afridi', type: 'run', run: 1 },
    { striker: 'Babar Azam', bowler: 'Shaheen Afridi', type: 'dot', run: 0 },
    { striker: 'Babar Azam', bowler: 'Shaheen Afridi', type: 'run', run: 4 },
  ],
};

export default function CoachingScreen() {
  const [loading, setLoading] = useState(null);
  const [battingTip, setBattingTip] = useState(null);
  const [bowlingTip, setBowlingTip] = useState(null);

  const loadTip = async (type) => {
    setLoading(type);

    const result =
      type === 'batting'
        ? await fetchBattingCoach(samplePayload)
        : type === 'bowling'
          ? await fetchBowlingCoach(samplePayload)
          : await fetchFullCoach(samplePayload);

    if (!result.success) {
      Alert.alert('AI Coach Error', result.error || 'Could not load coaching tip.');
      setLoading(null);
      return;
    }

    if (type === 'batting') setBattingTip(result.data);
    if (type === 'bowling') setBowlingTip(result.data);
    if (type === 'full') {
      setBattingTip(result.data.batting);
      setBowlingTip(result.data.bowling);
    }

    setLoading(null);
  };

  const TipCard = ({ title, tip }) => {
    if (!tip) return null;

    return (
      <View style={styles.card}>
        <Text style={styles.cardLabel}>{title}</Text>
        <Text style={styles.cardTitle}>{tip.title || 'Coaching tip'}</Text>
        <Text style={styles.player}>{tip.player}</Text>
        <Text style={styles.tip}>{tip.tip || tip.error}</Text>

        {tip.stats && (
          <View style={styles.statsRow}>
            {Object.entries(tip.stats).map(([key, value]) => (
              <View key={key} style={styles.stat}>
                <Text style={styles.statValue}>{value}</Text>
                <Text style={styles.statLabel}>{key.replace(/_/g, ' ')}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.title}>AI Coach</Text>
        <Text style={styles.subtitle}>
          Get batting and bowling advice from your coaching API.
        </Text>

        <View style={styles.actions}>
          <TouchableOpacity style={styles.button} onPress={() => loadTip('batting')} disabled={!!loading}>
            <Text style={styles.buttonText}>Batting Tip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.button} onPress={() => loadTip('bowling')} disabled={!!loading}>
            <Text style={styles.buttonText}>Bowling Tip</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.buttonPrimary]} onPress={() => loadTip('full')} disabled={!!loading}>
            <Text style={styles.buttonText}>Full Coach</Text>
          </TouchableOpacity>
        </View>

        {loading && (
          <View style={styles.loadingBox}>
            <ActivityIndicator color="#38bdf8" />
            <Text style={styles.loadingText}>Loading {loading} coach...</Text>
          </View>
        )}

        <TipCard title="Batting" tip={battingTip} />
        <TipCard title="Bowling" tip={bowlingTip} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f172a',
  },
  content: {
    padding: 20,
    paddingBottom: 40,
  },
  title: {
    color: '#f8fafc',
    fontSize: 30,
    fontWeight: '800',
    marginBottom: 8,
  },
  subtitle: {
    color: '#94a3b8',
    fontSize: 15,
    lineHeight: 22,
    marginBottom: 20,
  },
  actions: {
    gap: 12,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#1e293b',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonPrimary: {
    backgroundColor: '#0369a1',
    borderColor: '#38bdf8',
  },
  buttonText: {
    color: '#f8fafc',
    fontSize: 16,
    fontWeight: '700',
  },
  loadingBox: {
    alignItems: 'center',
    gap: 10,
    padding: 18,
  },
  loadingText: {
    color: '#94a3b8',
  },
  card: {
    backgroundColor: '#111827',
    borderColor: '#334155',
    borderWidth: 1,
    borderRadius: 8,
    padding: 16,
    marginBottom: 14,
  },
  cardLabel: {
    color: '#38bdf8',
    fontSize: 13,
    fontWeight: '800',
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  cardTitle: {
    color: '#f8fafc',
    fontSize: 20,
    fontWeight: '800',
    marginBottom: 6,
  },
  player: {
    color: '#cbd5e1',
    fontSize: 14,
    marginBottom: 12,
  },
  tip: {
    color: '#e2e8f0',
    fontSize: 16,
    lineHeight: 23,
  },
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 16,
  },
  stat: {
    backgroundColor: '#0f172a',
    borderRadius: 8,
    minWidth: 88,
    padding: 10,
  },
  statValue: {
    color: '#38bdf8',
    fontSize: 18,
    fontWeight: '800',
  },
  statLabel: {
    color: '#94a3b8',
    fontSize: 12,
    marginTop: 2,
    textTransform: 'capitalize',
  },
});
