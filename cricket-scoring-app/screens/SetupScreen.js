import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  ScrollView, StyleSheet, Alert, Platform,
} from 'react-native';
import { Picker } from '@react-native-picker/picker';

// ─── DEFAULTS ───────────────────────────────────────────────────────────────
const DEFAULT_SETUP = {
  teamA: { name: 'Team A', players: [] },
  teamB: { name: 'Team B', players: [] },
  tossWinner: 'Team A',
  tossDecision: 'bat',
  overs: '10',
  venue: '',
  matchDate: new Date().toLocaleDateString(),
  matchTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

export default function SetupScreen({ navigation }) {
  const [setup, setSetup] = useState(DEFAULT_SETUP);
  const [newPlayerA, setNewPlayerA] = useState('');
  const [newPlayerB, setNewPlayerB] = useState('');
  const [step, setStep] = useState(1); // 1=Teams, 2=Match details, 3=Review

  // ─── TEAM HELPERS ──────────────────────────────────────────────
  const addPlayer = (team, name) => {
    const key = team === 'A' ? 'teamA' : 'teamB';
    const trimmed = name.trim();
    if (!trimmed) return;
    if (setup[key].players.includes(trimmed)) {
      Alert.alert('Duplicate', `${trimmed} is already in ${setup[key].name}.`);
      return;
    }
    setSetup(prev => ({
      ...prev,
      [key]: { ...prev[key], players: [...prev[key].players, trimmed] },
    }));
    team === 'A' ? setNewPlayerA('') : setNewPlayerB('');
  };

  const removePlayer = (team, name) => {
    const key = team === 'A' ? 'teamA' : 'teamB';
    setSetup(prev => ({
      ...prev,
      [key]: { ...prev[key], players: prev[key].players.filter(p => p !== name) },
    }));
  };

  const updateTeamName = (team, name) => {
    const key = team === 'A' ? 'teamA' : 'teamB';
    setSetup(prev => ({ ...prev, [key]: { ...prev[key], name } }));
  };

  // ─── VALIDATION ────────────────────────────────────────────────
  const validateStep1 = () => {
    if (!setup.teamA.name.trim() || !setup.teamB.name.trim()) {
      Alert.alert('Missing', 'Please enter both team names.'); return false;
    }
    if (setup.teamA.players.length < 2) {
      Alert.alert('Missing', `${setup.teamA.name} needs at least 2 players.`); return false;
    }
    if (setup.teamB.players.length < 2) {
      Alert.alert('Missing', `${setup.teamB.name} needs at least 2 players.`); return false;
    }
    return true;
  };

  const validateStep2 = () => {
    if (!setup.overs || isNaN(setup.overs) || Number(setup.overs) < 1) {
      Alert.alert('Invalid', 'Please enter a valid number of overs.'); return false;
    }
    if (!setup.venue.trim()) {
      Alert.alert('Missing', 'Please enter a venue name.'); return false;
    }
    return true;
  };

  // ─── START MATCH ───────────────────────────────────────────────
  const startMatch = () => {
    const battingTeam = setup.tossDecision === 'bat' ? setup.tossWinner :
      (setup.tossWinner === setup.teamA.name ? setup.teamB.name : setup.teamA.name);
    const battingPlayers = battingTeam === setup.teamA.name
      ? setup.teamA.players : setup.teamB.players;
    const bowlingPlayers = battingTeam === setup.teamA.name
      ? setup.teamB.players : setup.teamA.players;

    Alert.alert(
      'Start Match?',
      `${battingTeam} will bat first at ${setup.venue}.\n${setup.overs} overs match.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start', onPress: () => {
            navigation.navigate('Home', {
              matchSetup: {
                ...setup,
                battingTeam,
                battingPlayers,
                bowlingPlayers,
                totalOvers: Number(setup.overs),
              }
            });
          }
        }
      ]
    );
  };

  // ─── STEP INDICATOR ────────────────────────────────────────────
  const StepIndicator = () => (
    <View style={styles.stepRow}>
      {['Teams', 'Details', 'Review'].map((label, i) => (
        <View key={i} style={styles.stepItem}>
          <View style={[styles.stepDot, step > i + 1 && styles.stepDone, step === i + 1 && styles.stepActive]}>
            <Text style={styles.stepDotText}>{step > i + 1 ? '✓' : i + 1}</Text>
          </View>
          <Text style={[styles.stepLabel, step === i + 1 && { color: '#38bdf8' }]}>{label}</Text>
        </View>
      ))}
      <View style={styles.stepLine} />
    </View>
  );

  // ─── STEP 1: TEAMS ─────────────────────────────────────────────
  const Step1 = () => (
    <View>
      {['A', 'B'].map(team => {
        const key = team === 'A' ? 'teamA' : 'teamB';
        const newPlayer = team === 'A' ? newPlayerA : newPlayerB;
        const setNewPlayer = team === 'A' ? setNewPlayerA : setNewPlayerB;
        const color = team === 'A' ? '#38bdf8' : '#f59e0b';

        return (
          <View key={team} style={styles.card}>
            <View style={styles.teamHeader}>
              <View style={[styles.teamBadge, { backgroundColor: color }]}>
                <Text style={styles.teamBadgeText}>Team {team}</Text>
              </View>
            </View>

            <Text style={styles.label}>Team Name</Text>
            <TextInput
              style={styles.input}
              value={setup[key].name}
              onChangeText={val => updateTeamName(team, val)}
              placeholder={`Team ${team} name`}
              placeholderTextColor="#475569"
            />

            <Text style={styles.label}>Players ({setup[key].players.length})</Text>
            <View style={styles.addRow}>
              <TextInput
                style={[styles.input, { flex: 1, marginBottom: 0 }]}
                value={newPlayer}
                onChangeText={setNewPlayer}
                placeholder="Player name"
                placeholderTextColor="#475569"
                onSubmitEditing={() => addPlayer(team, newPlayer)}
                returnKeyType="done"
              />
              <TouchableOpacity style={[styles.addBtn, { backgroundColor: color }]}
                onPress={() => addPlayer(team, newPlayer)}>
                <Text style={styles.addBtnText}>+ Add</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.playerList}>
              {setup[key].players.map((p, i) => (
                <View key={i} style={styles.playerChip}>
                  <Text style={styles.playerChipNum}>{i + 1}</Text>
                  <Text style={styles.playerChipName}>{p}</Text>
                  <TouchableOpacity onPress={() => removePlayer(team, p)}>
                    <Text style={styles.removeBtn}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}
              {setup[key].players.length === 0 && (
                <Text style={styles.emptyHint}>No players added yet</Text>
              )}
            </View>
          </View>
        );
      })}

      <TouchableOpacity style={styles.btnPrimary} onPress={() => validateStep1() && setStep(2)}>
        <Text style={styles.btnPrimaryText}>Next: Match Details →</Text>
      </TouchableOpacity>
    </View>
  );

  // ─── STEP 2: MATCH DETAILS ─────────────────────────────────────
  const Step2 = () => (
    <View>
      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Toss</Text>

        <Text style={styles.label}>Toss won by</Text>
        <View style={styles.pickerWrap}>
          <Picker
            selectedValue={setup.tossWinner}
            onValueChange={val => setSetup(prev => ({ ...prev, tossWinner: val }))}
            style={styles.picker}
            dropdownIconColor="#94a3b8"
          >
            <Picker.Item label={setup.teamA.name} value={setup.teamA.name} />
            <Picker.Item label={setup.teamB.name} value={setup.teamB.name} />
          </Picker>
        </View>

        <Text style={styles.label}>Elected to</Text>
        <View style={styles.toggleRow}>
          {['bat', 'field'].map(opt => (
            <TouchableOpacity key={opt}
              style={[styles.toggleBtn, setup.tossDecision === opt && styles.toggleBtnActive]}
              onPress={() => setSetup(prev => ({ ...prev, tossDecision: opt }))}>
              <Text style={[styles.toggleText, setup.tossDecision === opt && styles.toggleTextActive]}>
                {opt === 'bat' ? 'Bat first' : 'Field first'}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Match Info</Text>

        <Text style={styles.label}>Number of overs</Text>
        <View style={styles.oversRow}>
          {['5', '10', '20', '50'].map(o => (
            <TouchableOpacity key={o}
              style={[styles.oversChip, setup.overs === o && styles.oversChipActive]}
              onPress={() => setSetup(prev => ({ ...prev, overs: o }))}>
              <Text style={[styles.oversChipText, setup.overs === o && { color: '#0f172a' }]}>{o}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={setup.overs}
          onChangeText={val => setSetup(prev => ({ ...prev, overs: val }))}
          placeholder="Custom overs"
          placeholderTextColor="#475569"
          keyboardType="numeric"
        />

        <Text style={styles.label}>Venue</Text>
        <TextInput
          style={styles.input}
          value={setup.venue}
          onChangeText={val => setSetup(prev => ({ ...prev, venue: val }))}
          placeholder="e.g. Gaddafi Stadium, Lahore"
          placeholderTextColor="#475569"
        />

        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          value={setup.matchDate}
          onChangeText={val => setSetup(prev => ({ ...prev, matchDate: val }))}
          placeholder="DD/MM/YYYY"
          placeholderTextColor="#475569"
        />

        <Text style={styles.label}>Time</Text>
        <TextInput
          style={styles.input}
          value={setup.matchTime}
          onChangeText={val => setSetup(prev => ({ ...prev, matchTime: val }))}
          placeholder="e.g. 3:00 PM"
          placeholderTextColor="#475569"
        />
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep(1)}>
          <Text style={styles.btnSecondaryText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary} onPress={() => validateStep2() && setStep(3)}>
          <Text style={styles.btnPrimaryText}>Review →</Text>
        </TouchableOpacity>
      </View>
    </View>
  );

  // ─── STEP 3: REVIEW ────────────────────────────────────────────
  const Step3 = () => {
    const battingTeam = setup.tossDecision === 'bat' ? setup.tossWinner :
      (setup.tossWinner === setup.teamA.name ? setup.teamB.name : setup.teamA.name);
    const bowlingTeam = battingTeam === setup.teamA.name ? setup.teamB.name : setup.teamA.name;

    return (
      <View>
        <View style={styles.card}>
          <Text style={styles.sectionTitle}>Match Summary</Text>

          <View style={styles.reviewMatchup}>
            <View style={styles.reviewTeam}>
              <Text style={styles.reviewTeamName}>{setup.teamA.name}</Text>
              <Text style={styles.reviewTeamSub}>{setup.teamA.players.length} players</Text>
            </View>
            <View style={styles.vsCircle}><Text style={styles.vsText}>VS</Text></View>
            <View style={styles.reviewTeam}>
              <Text style={[styles.reviewTeamName, { textAlign: 'right' }]}>{setup.teamB.name}</Text>
              <Text style={[styles.reviewTeamSub, { textAlign: 'right' }]}>{setup.teamB.players.length} players</Text>
            </View>
          </View>

          {[
            ['Toss', `${setup.tossWinner} won, elected to ${setup.tossDecision}`],
            ['Batting first', battingTeam],
            ['Bowling first', bowlingTeam],
            ['Overs', setup.overs],
            ['Venue', setup.venue],
            ['Date', setup.matchDate],
            ['Time', setup.matchTime],
          ].map(([label, val]) => (
            <View key={label} style={styles.reviewRow}>
              <Text style={styles.reviewLabel}>{label}</Text>
              <Text style={styles.reviewVal}>{val}</Text>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{setup.teamA.name} — Batting order</Text>
          {setup.teamA.players.map((p, i) => (
            <Text key={i} style={styles.reviewPlayer}>{i + 1}. {p}</Text>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.sectionTitle}>{setup.teamB.name} — Batting order</Text>
          {setup.teamB.players.map((p, i) => (
            <Text key={i} style={styles.reviewPlayer}>{i + 1}. {p}</Text>
          ))}
        </View>

        <View style={styles.navRow}>
          <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep(2)}>
            <Text style={styles.btnSecondaryText}>← Edit</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.btnStart} onPress={startMatch}>
            <Text style={styles.btnStartText}>Start Match</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} keyboardShouldPersistTaps="handled">
      <Text style={styles.title}>Match Setup</Text>
      <StepIndicator />
      {step === 1 && <Step1 />}
      {step === 2 && <Step2 />}
      {step === 3 && <Step3 />}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ─── STYLES ─────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  title: { fontSize: 26, color: '#fff', fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },

  // Step indicator
  stepRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, position: 'relative' },
  stepLine: { position: 'absolute', top: 16, left: '16%', right: '16%', height: 1, backgroundColor: '#334155', zIndex: 0 },
  stepItem: { alignItems: 'center', zIndex: 1 },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1e293b', borderWidth: 1.5, borderColor: '#334155', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  stepActive: { borderColor: '#38bdf8', backgroundColor: '#0f172a' },
  stepDone: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  stepDotText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  stepLabel: { color: '#64748b', fontSize: 11 },

  // Cards
  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 14 },
  sectionTitle: { color: '#fff', fontWeight: 'bold', fontSize: 15, marginBottom: 12 },

  // Team header
  teamHeader: { flexDirection: 'row', marginBottom: 12 },
  teamBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  teamBadgeText: { color: '#0f172a', fontWeight: 'bold', fontSize: 12 },

  // Inputs
  label: { color: '#94a3b8', fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: '#0f172a', color: '#fff', padding: 12, borderRadius: 10, marginBottom: 4, borderWidth: 0.5, borderColor: '#334155', fontSize: 14 },

  // Add player row
  addRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, justifyContent: 'center' },
  addBtnText: { color: '#0f172a', fontWeight: 'bold', fontSize: 13 },

  // Player chips
  playerList: { gap: 6 },
  playerChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, gap: 10 },
  playerChipNum: { color: '#64748b', fontSize: 12, width: 18 },
  playerChipName: { color: '#e2e8f0', fontSize: 14, flex: 1 },
  removeBtn: { color: '#ef4444', fontSize: 14, paddingLeft: 4 },
  emptyHint: { color: '#475569', fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  // Toss toggle
  toggleRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
  toggleBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
  toggleText: { color: '#94a3b8', fontWeight: '600' },
  toggleTextActive: { color: '#0f172a' },

  // Overs quick-pick
  oversRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  oversChip: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  oversChipActive: { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
  oversChipText: { color: '#94a3b8', fontWeight: 'bold' },

  // Picker
  pickerWrap: { backgroundColor: '#0f172a', borderRadius: 10, borderWidth: 0.5, borderColor: '#334155', marginBottom: 4, overflow: 'hidden' },
  picker: { color: '#fff' },

  // Review
  reviewMatchup: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  reviewTeam: { flex: 1 },
  reviewTeamName: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  reviewTeamSub: { color: '#64748b', fontSize: 12 },
  vsCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  vsText: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold' },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 0.5, borderTopColor: '#334155' },
  reviewLabel: { color: '#64748b', fontSize: 13 },
  reviewVal: { color: '#e2e8f0', fontSize: 13, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  reviewPlayer: { color: '#94a3b8', fontSize: 13, paddingVertical: 3 },

  // Buttons
  btnPrimary: { backgroundColor: '#38bdf8', padding: 15, borderRadius: 12, alignItems: 'center', marginTop: 4 },
  btnPrimaryText: { color: '#0f172a', fontWeight: 'bold', fontSize: 15 },
  btnSecondary: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  btnSecondaryText: { color: '#94a3b8', fontWeight: '600', fontSize: 14 },
  btnStart: { flex: 2, backgroundColor: '#22c55e', padding: 15, borderRadius: 12, alignItems: 'center', marginLeft: 10 },
  btnStartText: { color: '#0f172a', fontWeight: 'bold', fontSize: 15 },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 4 },
});