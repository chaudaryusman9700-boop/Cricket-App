import { useRouter } from 'expo-router';
import React, { useState, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity,
  StyleSheet, Alert, Platform,
} from 'react-native';
import { KeyboardAwareScrollView } from 'react-native-keyboard-aware-scroll-view';
import { Picker } from '@react-native-picker/picker';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';

const DEFAULT_SETUP = {
  teamAName: 'Team A',
  teamBName: 'Team B',
  teamAPlayers: [],
  teamBPlayers: [],
  tossWinner: 'A',
  tossDecision: 'bat',
  overs: '10',
  venue: '',
  matchDate: new Date().toLocaleDateString(),
  matchTime: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
};

// ── Replace with your actual API key from openweathermap.org ──
const WEATHER_API_KEY = 'YOUR_API_KEY_HERE';

export default function SetupScreen() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [resumeMatch, setResumeMatch] = useState(null);
  const [showResume, setShowResume] = useState(false);

  // ── Check for unfinished match on startup ──
  useEffect(() => {
    checkUnfinishedMatch();
  }, []);

  const checkUnfinishedMatch = async () => {
    try {
      const data = await AsyncStorage.getItem('currentMatch');
      if (!data) return;
      const parsed = JSON.parse(data);
      const match = parsed.match || parsed;

      // Only show resume if match is not finished (balls < totalOvers * 6 and not all out)
      const totalOvers = match.totalOvers || 10;
      const hasData = match.balls > 0;
      // Show resume if match has data - even after 1st innings (2nd innings not started yet)
      // Only skip if both innings are fully done
      const bothInningsDone = match.inningsEnded && match.innings === 2;

      if (hasData && !bothInningsDone) {
        setResumeMatch(parsed);
        setShowResume(true);
      }
    } catch (e) {
      console.log('Resume check error:', e);
    }
  };

  const resumeLastMatch = () => {
    router.push({
      pathname: '/scoring',
      params: { resumeMatch: JSON.stringify(resumeMatch) }
    });
    setShowResume(false);
  };

  const discardAndStartNew = async () => {
    Alert.alert(
      'Start New Match?',
      'This will discard the previous unfinished match.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start New',
          style: 'destructive',
          onPress: async () => {
            await AsyncStorage.removeItem('currentMatch');
            await AsyncStorage.removeItem('firstInnings');
            setShowResume(false);
          }
        }
      ]
    );
  };
  const [setup, setSetup] = useState(DEFAULT_SETUP);
  const [newPlayerA, setNewPlayerA] = useState('');
  const [newPlayerB, setNewPlayerB] = useState('');
  const [weather, setWeather] = useState(null);
  const [weatherLoading, setWeatherLoading] = useState(false);
  const [weatherError, setWeatherError] = useState('');
  const [locationName, setLocationName] = useState('');

  // Stable setters — these never change so inputs don't lose focus
  const setField = (key, val) => setSetup(prev => ({ ...prev, [key]: val }));

  // ── Fetch weather by GPS coordinates ──
  const fetchWeatherByGPS = async () => {
    setWeatherLoading(true);
    setWeatherError('');
    setWeather(null);
    try {
      // Request location permission
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setWeatherError('Location permission denied. Try city name instead.');
        setWeatherLoading(false);
        return;
      }

      // Get exact GPS coordinates
      const loc = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.High,
      });

      const { latitude, longitude } = loc.coords;

      // Reverse geocode to get area/neighbourhood name
      const geocode = await Location.reverseGeocodeAsync({ latitude, longitude });
      if (geocode.length > 0) {
        const g = geocode[0];
        const rawName = g.district || g.subregion || g.name || '';
        const city = g.city || g.region || '';
        const placeName = [rawName, city].filter(Boolean).join(', ');
        setLocationName(placeName);
      }

      // Fetch weather using exact coordinates
      const url = `https://api.openweathermap.org/data/2.5/weather?lat=${latitude}&lon=${longitude}&appid=${WEATHER_API_KEY}&units=metric`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.cod === 200) {
        setWeather(data);
        const condition = data.weather[0].main.toLowerCase();
        if (['rain', 'drizzle', 'thunderstorm', 'snow'].includes(condition)) {
          Alert.alert(
            '⚠️ Weather Warning',
            `${data.weather[0].description} expected at your location. Consider rescheduling the match!`,
            [{ text: 'OK' }]
          );
        }
      } else {
        setWeatherError('Could not get weather for your location.');
      }
    } catch (e) {
      setWeatherError('Location error: ' + e.message);
    }
    setWeatherLoading(false);
  };

  // ── Fetch weather by city name (fallback) ──
  const fetchWeatherByCity = async (city) => {
    if (!city || city.trim().length < 3) {
      setWeatherError('Enter a venue name first.');
      return;
    }
    setWeatherLoading(true);
    setWeatherError('');
    setWeather(null);
    try {
      const cityName = city.split(',').pop().trim();
      const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(cityName)}&appid=${WEATHER_API_KEY}&units=metric`;
      const res = await fetch(url);
      const data = await res.json();
      if (data.cod === 200) {
        setWeather(data);
        setLocationName(data.name);
        const condition = data.weather[0].main.toLowerCase();
        if (['rain', 'drizzle', 'thunderstorm', 'snow'].includes(condition)) {
          Alert.alert(
            '⚠️ Weather Warning',
            `${data.weather[0].description} expected at ${data.name}. Consider rescheduling!`,
            [{ text: 'OK' }]
          );
        }
      } else {
        setWeatherError('City not found. Try using GPS instead.');
      }
    } catch (e) {
      setWeatherError('Could not fetch weather. Check internet.');
    }
    setWeatherLoading(false);
  };

  const addPlayer = (team) => {
    const key = team === 'A' ? 'teamAPlayers' : 'teamBPlayers';
    const name = (team === 'A' ? newPlayerA : newPlayerB).trim();
    if (!name) return;
    if (setup[key].includes(name)) {
      Alert.alert('Duplicate', `${name} is already added.`);
      return;
    }
    setSetup(prev => ({ ...prev, [key]: [...prev[key], name] }));
    team === 'A' ? setNewPlayerA('') : setNewPlayerB('');
  };

  const removePlayer = (team, name) => {
    const key = team === 'A' ? 'teamAPlayers' : 'teamBPlayers';
    setSetup(prev => ({ ...prev, [key]: prev[key].filter(p => p !== name) }));
  };

  const validateStep1 = () => {
    if (!setup.teamAName.trim() || !setup.teamBName.trim()) {
      Alert.alert('Missing', 'Please enter both team names.'); return false;
    }
    if (setup.teamAPlayers.length < 2) {
      Alert.alert('Missing', `${setup.teamAName} needs at least 2 players.`); return false;
    }
    if (setup.teamBPlayers.length < 2) {
      Alert.alert('Missing', `${setup.teamBName} needs at least 2 players.`); return false;
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

  const startMatch = () => {
    const battingTeam = setup.tossDecision === 'bat'
      ? (setup.tossWinner === 'A' ? setup.teamAName : setup.teamBName)
      : (setup.tossWinner === 'A' ? setup.teamBName : setup.teamAName);

    const battingPlayers = battingTeam === setup.teamAName ? setup.teamAPlayers : setup.teamBPlayers;
    const bowlingPlayers = battingTeam === setup.teamAName ? setup.teamBPlayers : setup.teamAPlayers;

    Alert.alert(
      'Start Match?',
      `${battingTeam} will bat first at ${setup.venue}.\n${setup.overs} overs match.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Start', onPress: async () => {
            // ── Clear ALL old match data before starting fresh ──
            await AsyncStorage.removeItem('currentMatch');
            await AsyncStorage.removeItem('firstInnings');
            await AsyncStorage.removeItem('matchResult');
            router.push({
              pathname: '/scoring',
              params: {
                matchSetup: JSON.stringify({
                  teamA: { name: setup.teamAName, players: setup.teamAPlayers },
                  teamB: { name: setup.teamBName, players: setup.teamBPlayers },
                  battingTeam,
                  battingPlayers,
                  bowlingPlayers,
                  totalOvers: Number(setup.overs),
                  venue: setup.venue,
                  matchDate: setup.matchDate,
                  matchTime: setup.matchTime,
                })
              }
            });
          }
        }
      ]
    );
  };

  // ── Resume card component ──
  const ResumeCard = () => {
    if (!showResume || !resumeMatch) return null;
    const m = resumeMatch.match || resumeMatch;
    const getOvers = () => `${Math.floor(m.balls / 6)}.${m.balls % 6}`;
    return (
      <View style={styles.resumeCard}>
        <View style={styles.resumeHeader}>
          <Text style={styles.resumeTitle}>🏏 Unfinished Match Found</Text>
          <TouchableOpacity onPress={discardAndStartNew}>
            <Text style={styles.resumeDismiss}>✕</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.resumeInfo}>
          <View>
            <Text style={styles.resumeTeam}>{m.battingTeam || 'Team A'}</Text>
            <Text style={styles.resumeScore}>{m.runs}/{m.wickets}</Text>
            <Text style={styles.resumeOvers}>Overs: {getOvers()} / {m.totalOvers || 10}</Text>
            {m.venue ? <Text style={styles.resumeVenue}>📍 {m.venue}</Text> : null}
          </View>
          <TouchableOpacity style={styles.resumeBtn} onPress={resumeLastMatch}>
            <Text style={styles.resumeBtnText}>Resume →</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  // ── Step indicator ──
  const StepIndicator = () => (
    <View style={styles.stepRow}>
      <View style={styles.stepLine} />
      {['Teams', 'Details', 'Review'].map((label, i) => (
        <View key={i} style={styles.stepItem}>
          <View style={[
            styles.stepDot,
            step > i + 1 && styles.stepDone,
            step === i + 1 && styles.stepActive
          ]}>
            <Text style={styles.stepDotText}>{step > i + 1 ? '✓' : i + 1}</Text>
          </View>
          <Text style={[styles.stepLabel, step === i + 1 && { color: '#38bdf8' }]}>{label}</Text>
        </View>
      ))}
    </View>
  );

  // ── STEP 1: Teams & Players ──
  if (step === 1) return (
    <KeyboardAwareScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={120}
      enableAutomaticScroll={true}
    >
      <Text style={styles.title}>Match Setup</Text>
      <ResumeCard />

      {/* ── Schedule button ── */}
      <TouchableOpacity
        style={styles.scheduleBtn}
        onPress={() => router.push('/schedule')}
      >
        <Text style={styles.scheduleBtnText}>📅 Schedule an upcoming match</Text>
      </TouchableOpacity>

      <StepIndicator />

      {/* Team A */}
      <View style={styles.card}>
        <View style={styles.teamBadgeRow}>
          <View style={[styles.teamBadge, { backgroundColor: '#38bdf8' }]}>
            <Text style={styles.teamBadgeText}>Team A</Text>
          </View>
        </View>
        <Text style={styles.label}>Team name</Text>
        <TextInput
          style={styles.input}
          value={setup.teamAName}
          onChangeText={val => setField('teamAName', val)}
          placeholder="Enter team name"
          placeholderTextColor="#475569"
          returnKeyType="done"
        />
        <Text style={styles.label}>Players ({setup.teamAPlayers.length})</Text>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={newPlayerA}
            onChangeText={setNewPlayerA}
            placeholder="Player name"
            placeholderTextColor="#475569"
            returnKeyType="done"
            onSubmitEditing={() => addPlayer('A')}
            blurOnSubmit={false}
          />
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#38bdf8' }]}
            onPress={() => addPlayer('A')}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.playerList}>
          {setup.teamAPlayers.map((p, i) => (
            <View key={i} style={styles.playerChip}>
              <Text style={styles.playerChipNum}>{i + 1}</Text>
              <Text style={styles.playerChipName}>{p}</Text>
              <TouchableOpacity onPress={() => removePlayer('A', p)}>
                <Text style={styles.removeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {setup.teamAPlayers.length === 0 &&
            <Text style={styles.emptyHint}>No players added yet</Text>}
        </View>
      </View>

      {/* Team B */}
      <View style={styles.card}>
        <View style={styles.teamBadgeRow}>
          <View style={[styles.teamBadge, { backgroundColor: '#f59e0b' }]}>
            <Text style={styles.teamBadgeText}>Team B</Text>
          </View>
        </View>
        <Text style={styles.label}>Team name</Text>
        <TextInput
          style={styles.input}
          value={setup.teamBName}
          onChangeText={val => setField('teamBName', val)}
          placeholder="Enter team name"
          placeholderTextColor="#475569"
          returnKeyType="done"
        />
        <Text style={styles.label}>Players ({setup.teamBPlayers.length})</Text>
        <View style={styles.addRow}>
          <TextInput
            style={[styles.input, { flex: 1, marginBottom: 0 }]}
            value={newPlayerB}
            onChangeText={setNewPlayerB}
            placeholder="Player name"
            placeholderTextColor="#475569"
            returnKeyType="done"
            onSubmitEditing={() => addPlayer('B')}
            blurOnSubmit={false}
          />
          <TouchableOpacity style={[styles.addBtn, { backgroundColor: '#f59e0b' }]}
            onPress={() => addPlayer('B')}>
            <Text style={styles.addBtnText}>+ Add</Text>
          </TouchableOpacity>
        </View>
        <View style={styles.playerList}>
          {setup.teamBPlayers.map((p, i) => (
            <View key={i} style={styles.playerChip}>
              <Text style={styles.playerChipNum}>{i + 1}</Text>
              <Text style={styles.playerChipName}>{p}</Text>
              <TouchableOpacity onPress={() => removePlayer('B', p)}>
                <Text style={styles.removeBtn}>✕</Text>
              </TouchableOpacity>
            </View>
          ))}
          {setup.teamBPlayers.length === 0 &&
            <Text style={styles.emptyHint}>No players added yet</Text>}
        </View>
      </View>

      <TouchableOpacity style={styles.btnPrimary}
        onPress={() => validateStep1() && setStep(2)}>
        <Text style={styles.btnPrimaryText}>Next: Match Details →</Text>
      </TouchableOpacity>
      <View style={{ height: 40 }} />
    </KeyboardAwareScrollView>
  );

  // ── STEP 2: Match Details ──
  if (step === 2) return (
    <KeyboardAwareScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={120}
      enableAutomaticScroll={true}
    >
      <Text style={styles.title}>Match Setup</Text>
      <StepIndicator />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Toss</Text>
        <Text style={styles.label}>Toss won by</Text>
        <View style={styles.toggleRow}>
          {[['A', setup.teamAName], ['B', setup.teamBName]].map(([key, name]) => (
            <TouchableOpacity key={key}
              style={[styles.toggleBtn, setup.tossWinner === key && styles.toggleBtnActive]}
              onPress={() => setField('tossWinner', key)}>
              <Text style={[styles.toggleText, setup.tossWinner === key && styles.toggleTextActive]}>
                {name}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
        <Text style={styles.label}>Elected to</Text>
        <View style={styles.toggleRow}>
          {[['bat', 'Bat first'], ['field', 'Field first']].map(([key, label]) => (
            <TouchableOpacity key={key}
              style={[styles.toggleBtn, setup.tossDecision === key && styles.toggleBtnActive]}
              onPress={() => setField('tossDecision', key)}>
              <Text style={[styles.toggleText, setup.tossDecision === key && styles.toggleTextActive]}>
                {label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Match Info</Text>
        <Text style={styles.label}>Overs</Text>
        <View style={styles.oversRow}>
          {['5', '10', '20', '50'].map(o => (
            <TouchableOpacity key={o}
              style={[styles.oversChip, setup.overs === o && styles.oversChipActive]}
              onPress={() => setField('overs', o)}>
              <Text style={[styles.oversChipText, setup.overs === o && { color: '#0f172a' }]}>{o}</Text>
            </TouchableOpacity>
          ))}
        </View>
        <TextInput
          style={styles.input}
          value={setup.overs}
          onChangeText={val => setField('overs', val)}
          placeholder="Custom overs"
          placeholderTextColor="#475569"
          keyboardType="numeric"
          returnKeyType="done"
        />
        <Text style={styles.label}>Venue</Text>
        <TextInput
          style={styles.input}
          value={setup.venue}
          onChangeText={val => setField('venue', val)}
          placeholder="e.g. Gaddafi Stadium, Lahore"
          placeholderTextColor="#475569"
          returnKeyType="done"
        />
        {/* Weather buttons */}
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8, marginBottom: 4 }}>
          <TouchableOpacity
            style={[styles.weatherBtn, { flex: 1 }]}
            onPress={fetchWeatherByGPS}>
            <Text style={styles.weatherBtnText}>
              {weatherLoading ? 'Getting location...' : '📍 Use My Location'}
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.weatherBtn, { flex: 1, borderColor: '#64748b' }]}
            onPress={() => fetchWeatherByCity(setup.venue)}>
            <Text style={[styles.weatherBtnText, { color: '#64748b' }]}>
              🌤 By City Name
            </Text>
          </TouchableOpacity>
        </View>

        {weatherError ? (
          <Text style={styles.weatherError}>{weatherError}</Text>
        ) : null}

        {weather && (
          <View style={styles.weatherCard}>
            <View style={styles.weatherRow}>
              <Text style={styles.weatherTemp}>{Math.round(weather.main.temp)}°C</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.weatherDesc}>{weather.weather[0].description}</Text>
                <Text style={styles.weatherCity}>📍 {locationName || weather.name}</Text>
              </View>
            </View>
            <View style={styles.weatherDetails}>
              <View style={styles.weatherDetailItem}>
                <Text style={styles.weatherDetailVal}>{weather.main.humidity}%</Text>
                <Text style={styles.weatherDetailLabel}>Humidity</Text>
              </View>
              <View style={styles.weatherDetailItem}>
                <Text style={styles.weatherDetailVal}>{Math.round(weather.wind.speed * 3.6)} km/h</Text>
                <Text style={styles.weatherDetailLabel}>Wind</Text>
              </View>
              <View style={styles.weatherDetailItem}>
                <Text style={styles.weatherDetailVal}>{weather.main.feels_like ? Math.round(weather.main.feels_like) + '°C' : '—'}</Text>
                <Text style={styles.weatherDetailLabel}>Feels like</Text>
              </View>
              <View style={styles.weatherDetailItem}>
                <Text style={[styles.weatherDetailVal, {
                  color: ['Rain','Drizzle','Thunderstorm'].includes(weather.weather[0].main) ? '#ef4444' : '#22c55e'
                }]}>
                  {['Rain','Drizzle','Thunderstorm'].includes(weather.weather[0].main) ? '⚠️ Bad' : '✅ Good'}
                </Text>
                <Text style={styles.weatherDetailLabel}>Conditions</Text>
              </View>
            </View>
          </View>
        )}

        <Text style={styles.label}>Date</Text>
        <TextInput
          style={styles.input}
          value={setup.matchDate}
          onChangeText={val => setField('matchDate', val)}
          placeholder="DD/MM/YYYY"
          placeholderTextColor="#475569"
          returnKeyType="done"
        />
        <Text style={styles.label}>Time</Text>
        <TextInput
          style={styles.input}
          value={setup.matchTime}
          onChangeText={val => setField('matchTime', val)}
          placeholder="e.g. 3:00 PM"
          placeholderTextColor="#475569"
          returnKeyType="done"
        />
      </View>

      <View style={styles.navRow}>
        <TouchableOpacity style={styles.btnSecondary} onPress={() => setStep(1)}>
          <Text style={styles.btnSecondaryText}>← Back</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.btnPrimary}
          onPress={() => validateStep2() && setStep(3)}>
          <Text style={styles.btnPrimaryText}>Review →</Text>
        </TouchableOpacity>
      </View>
      <View style={{ height: 40 }} />
    </KeyboardAwareScrollView>
  );

  // ── STEP 3: Review ──
  const battingTeam = setup.tossDecision === 'bat'
    ? (setup.tossWinner === 'A' ? setup.teamAName : setup.teamBName)
    : (setup.tossWinner === 'A' ? setup.teamBName : setup.teamAName);
  const bowlingTeam = battingTeam === setup.teamAName ? setup.teamBName : setup.teamAName;

  return (
    <KeyboardAwareScrollView
      style={styles.container}
      keyboardShouldPersistTaps="handled"
      enableOnAndroid={true}
      extraScrollHeight={120}
      enableAutomaticScroll={true}
    >
      <Text style={styles.title}>Match Setup</Text>
      <StepIndicator />

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>Match Summary</Text>
        <View style={styles.reviewMatchup}>
          <View style={{ flex: 1 }}>
            <Text style={styles.reviewTeamName}>{setup.teamAName}</Text>
            <Text style={styles.reviewTeamSub}>{setup.teamAPlayers.length} players</Text>
          </View>
          <View style={styles.vsCircle}><Text style={styles.vsText}>VS</Text></View>
          <View style={{ flex: 1, alignItems: 'flex-end' }}>
            <Text style={styles.reviewTeamName}>{setup.teamBName}</Text>
            <Text style={styles.reviewTeamSub}>{setup.teamBPlayers.length} players</Text>
          </View>
        </View>
        {[
          ['Batting first', battingTeam],
          ['Bowling first', bowlingTeam],
          ['Toss', `${setup.tossWinner === 'A' ? setup.teamAName : setup.teamBName} won`],
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
        <Text style={styles.sectionTitle}>{setup.teamAName} players</Text>
        {setup.teamAPlayers.map((p, i) => (
          <Text key={i} style={styles.reviewPlayer}>{i + 1}. {p}</Text>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>{setup.teamBName} players</Text>
        {setup.teamBPlayers.map((p, i) => (
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
      <View style={{ height: 40 }} />
    </KeyboardAwareScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', padding: 16 },
  scheduleBtn: {
    backgroundColor: '#1e293b',
    borderWidth: 1,
    borderColor: '#38bdf8',
    borderRadius: 12,
    padding: 14,
    alignItems: 'center',
    marginBottom: 16,
  },
  scheduleBtnText: {
    color: '#38bdf8',
    fontWeight: '600',
    fontSize: 14,
  },
  title: { fontSize: 26, color: '#fff', fontWeight: 'bold', textAlign: 'center', marginBottom: 20 },

  stepRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24, position: 'relative' },
  stepLine: { position: 'absolute', top: 16, left: '16%', right: '16%', height: 1, backgroundColor: '#334155', zIndex: 0 },
  stepItem: { alignItems: 'center', zIndex: 1 },
  stepDot: { width: 32, height: 32, borderRadius: 16, backgroundColor: '#1e293b', borderWidth: 1.5, borderColor: '#334155', justifyContent: 'center', alignItems: 'center', marginBottom: 4 },
  stepActive: { borderColor: '#38bdf8' },
  stepDone: { backgroundColor: '#22c55e', borderColor: '#22c55e' },
  stepDotText: { color: '#fff', fontSize: 12, fontWeight: 'bold' },
  stepLabel: { color: '#64748b', fontSize: 11 },

  card: { backgroundColor: '#1e293b', borderRadius: 16, padding: 16, marginBottom: 14 },
  sectionTitle: { color: '#fff', fontWeight: 'bold', fontSize: 15, marginBottom: 12 },
  teamBadgeRow: { flexDirection: 'row', marginBottom: 12 },
  teamBadge: { paddingHorizontal: 12, paddingVertical: 4, borderRadius: 20 },
  teamBadgeText: { color: '#0f172a', fontWeight: 'bold', fontSize: 12 },

  label: { color: '#94a3b8', fontSize: 13, marginBottom: 6, marginTop: 10 },
  input: { backgroundColor: '#0f172a', color: '#fff', padding: 12, borderRadius: 10, marginBottom: 4, borderWidth: 0.5, borderColor: '#334155', fontSize: 14 },

  addRow: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  addBtn: { paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, justifyContent: 'center' },
  addBtnText: { color: '#0f172a', fontWeight: 'bold', fontSize: 13 },

  playerList: { gap: 6 },
  playerChip: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#0f172a', borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, gap: 10 },
  playerChipNum: { color: '#64748b', fontSize: 12, width: 18 },
  playerChipName: { color: '#e2e8f0', fontSize: 14, flex: 1 },
  removeBtn: { color: '#ef4444', fontSize: 14 },
  emptyHint: { color: '#475569', fontSize: 13, textAlign: 'center', paddingVertical: 8 },

  toggleRow: { flexDirection: 'row', gap: 10, marginTop: 4, marginBottom: 4 },
  toggleBtn: { flex: 1, padding: 12, borderRadius: 10, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  toggleBtnActive: { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
  toggleText: { color: '#94a3b8', fontWeight: '600' },
  toggleTextActive: { color: '#0f172a' },

  oversRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  oversChip: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  oversChipActive: { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
  oversChipText: { color: '#94a3b8', fontWeight: 'bold' },

  reviewMatchup: { flexDirection: 'row', alignItems: 'center', marginBottom: 16, gap: 8 },
  reviewTeamName: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
  reviewTeamSub: { color: '#64748b', fontSize: 12 },
  vsCircle: { width: 36, height: 36, borderRadius: 18, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center' },
  vsText: { color: '#94a3b8', fontSize: 11, fontWeight: 'bold' },
  reviewRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderTopWidth: 0.5, borderTopColor: '#334155' },
  reviewLabel: { color: '#64748b', fontSize: 13 },
  reviewVal: { color: '#e2e8f0', fontSize: 13, fontWeight: '500', maxWidth: '60%', textAlign: 'right' },
  reviewPlayer: { color: '#94a3b8', fontSize: 13, paddingVertical: 3 },

  btnPrimary: { backgroundColor: '#38bdf8', padding: 15, borderRadius: 12, alignItems: 'center', flex: 1 },
  btnPrimaryText: { color: '#0f172a', fontWeight: 'bold', fontSize: 15 },
  btnSecondary: { flex: 1, padding: 15, borderRadius: 12, alignItems: 'center', borderWidth: 1, borderColor: '#334155' },
  btnSecondaryText: { color: '#94a3b8', fontWeight: '600', fontSize: 14 },
  btnStart: { flex: 2, backgroundColor: '#22c55e', padding: 15, borderRadius: 12, alignItems: 'center', marginLeft: 10 },
  btnStartText: { color: '#0f172a', fontWeight: 'bold', fontSize: 15 },
  navRow: { flexDirection: 'row', gap: 10, marginTop: 4 },

  // Resume card
  resumeCard: {
    backgroundColor: '#1a2e1a', borderRadius: 14, padding: 14,
    marginBottom: 16, borderWidth: 1, borderColor: '#22c55e',
  },
  resumeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  resumeTitle: { color: '#22c55e', fontWeight: 'bold', fontSize: 14 },
  resumeDismiss: { color: '#64748b', fontSize: 18, paddingHorizontal: 6 },
  resumeInfo: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  resumeTeam: { color: '#94a3b8', fontSize: 12, marginBottom: 2 },
  resumeScore: { color: '#fff', fontSize: 28, fontWeight: 'bold' },
  resumeOvers: { color: '#64748b', fontSize: 12 },
  resumeVenue: { color: '#475569', fontSize: 11, marginTop: 2 },
  resumeBtn: { backgroundColor: '#22c55e', paddingHorizontal: 20, paddingVertical: 12, borderRadius: 10 },
  resumeBtnText: { color: '#0f172a', fontWeight: 'bold', fontSize: 14 },

  weatherBtn: {
    backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#38bdf8',
    borderRadius: 10, padding: 12, alignItems: 'center', marginTop: 8, marginBottom: 4,
  },
  weatherBtnText: { color: '#38bdf8', fontWeight: '600', fontSize: 13 },
  weatherError: { color: '#ef4444', fontSize: 12, textAlign: 'center', marginTop: 4 },
  weatherCard: { backgroundColor: '#0f172a', borderRadius: 12, padding: 14, marginTop: 8, marginBottom: 4 },
  weatherRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, marginBottom: 12 },
  weatherTemp: { color: '#38bdf8', fontSize: 40, fontWeight: 'bold' },
  weatherDesc: { color: '#fff', fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  weatherCity: { color: '#64748b', fontSize: 12, marginTop: 2, flexWrap: 'wrap' },
  weatherDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  weatherDetailItem: { alignItems: 'center' },
  weatherDetailVal: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  weatherDetailLabel: { color: '#64748b', fontSize: 11, marginTop: 2 },
});