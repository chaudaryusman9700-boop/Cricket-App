import AsyncStorage from '@react-native-async-storage/async-storage';
import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity,
  TextInput, Alert, Modal, RefreshControl, Platform,
  KeyboardAvoidingView,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import * as Location from 'expo-location';

// ── Safe notifications — works in Expo Go and standalone ──
let _notif = null;
const getNotif = () => {
  if (_notif !== null) return _notif;
  try {
    _notif = require('expo-notifications');
    _notif.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowAlert: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
  } catch (e) {
    _notif = false;
  }
  return _notif || null;
};

// ── Weather code helper ──
const getWeatherInfo = (code) => {
  if (code === 0) return { desc: 'Clear sky', icon: '☀️', bad: false, alert: null };
  if (code <= 2) return { desc: 'Partly cloudy', icon: '⛅', bad: false, alert: null };
  if (code === 3) return { desc: 'Overcast', icon: '☁️', bad: false, alert: null };
  if (code <= 48) return { desc: 'Foggy', icon: '🌫️', bad: true, alert: 'Foggy conditions expected. Visibility may be poor.' };
  if (code <= 57) return { desc: 'Drizzle expected', icon: '🌦️', bad: true, alert: 'Rain may be possible. Match conditions may be affected.' };
  if (code <= 67) return { desc: 'Rain expected', icon: '🌧️', bad: true, alert: 'Rain expected. Consider rescheduling.' };
  if (code <= 77) return { desc: 'Snow expected', icon: '❄️', bad: true, alert: 'Snow expected. Match unlikely.' };
  if (code <= 82) return { desc: 'Rain showers', icon: '🌧️', bad: true, alert: 'Rain showers expected. Match conditions may be affected.' };
  if (code >= 95) return { desc: 'Thunderstorm', icon: '⛈️', bad: true, alert: 'Thunderstorm expected! Do not play.' };
  return { desc: 'Unknown', icon: '🌡️', bad: false, alert: null };
};

// ── Send immediate weather notification ──
const notifyWeather = async (match, weather) => {
  const Notif = getNotif();
  if (!Notif) return;
  try {
    const { status } = await Notif.requestPermissionsAsync();
    if (status !== 'granted') return;
    await Notif.scheduleNotificationAsync({
      content: {
        title: `⚠️ Weather Alert — ${match.teamA} vs ${match.teamB}`,
        body: weather.alert || `${weather.icon} ${weather.desc} expected at ${match.venue}`,
      },
      trigger: null,
    });
  } catch (e) { console.log('notify error:', e); }
};

// ── Schedule reminder notification 1hr before match ──
const scheduleMatchReminder = async (match) => {
  const Notif = getNotif();
  if (!Notif || !match.date || !match.time) return null;
  try {
    const { status } = await Notif.requestPermissionsAsync();
    if (status !== 'granted') return null;

    const dateStr = `${match.date} ${match.time}`;
    const matchDate = new Date(dateStr);
    if (isNaN(matchDate.getTime())) return null;

    const reminderDate = new Date(matchDate.getTime() - 60 * 60 * 1000); // 1hr before
    if (reminderDate <= new Date()) return null;

    const id = await Notif.scheduleNotificationAsync({
      content: {
        title: `🏏 Match Starting Soon!`,
        body: `${match.teamA} vs ${match.teamB} at ${match.venue} starts in 1 hour`,
      },
      trigger: { date: reminderDate },
    });
    return id;
  } catch (e) {
    console.log('reminder error:', e);
    return null;
  }
};

const defaultForm = {
  teamA: '', teamB: '', venue: '', date: '', time: '',
  overs: '10', players: [],
};

export default function ScheduleScreen() {
  const router = useRouter();
  const [matches, setMatches] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [showDetailModal, setShowDetailModal] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [weatherLoading, setWeatherLoading] = useState(false);
  // ── Individual states to prevent keyboard dismiss on re-render ──
  const [teamA, setTeamA] = useState('');
  const [teamB, setTeamB] = useState('');
  const [matchDate, setMatchDate] = useState('');
  const [matchTime, setMatchTime] = useState('');
  const [venue, setVenue] = useState('');
  const [overs, setOvers] = useState('10');
  const [players, setPlayers] = useState([]);
  const [newPlayer, setNewPlayer] = useState('');
  const [detailNewPlayer, setDetailNewPlayer] = useState('');
  const [formWeather, setFormWeather] = useState(null);

  useFocusEffect(
    useCallback(() => {
      loadMatches();
      checkWeatherAlerts();
    }, [])
  );

  const loadMatches = async () => {
    try {
      const data = await AsyncStorage.getItem('scheduledMatches');
      if (data) setMatches(JSON.parse(data));
    } catch (e) { console.log(e); }
  };

  const saveMatches = async (updated) => {
    await AsyncStorage.setItem('scheduledMatches', JSON.stringify(updated));
    setMatches(updated);
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMatches();
    await checkWeatherAlerts();
    setRefreshing(false);
  };

  // ── Fetch weather by city name ──
  const fetchWeatherForCity = async (venue) => {
    if (!venue || venue.trim().length < 2) return null;
    try {
      const cityName = venue.split(',').pop().trim();
      const geoUrl = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(cityName)}&count=1`;
      const geoRes = await fetch(geoUrl);
      const geoData = await geoRes.json();
      if (!geoData.results?.length) return null;
      const { latitude, longitude, name } = geoData.results[0];
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code&wind_speed_unit=kmh`;
      const res = await fetch(url);
      const data = await res.json();
      if (!data.current) return null;
      const info = getWeatherInfo(data.current.weather_code);
      return {
        temp: Math.round(data.current.temperature_2m),
        humidity: data.current.relative_humidity_2m,
        wind: Math.round(data.current.wind_speed_10m),
        city: name,
        ...info,
      };
    } catch (e) { return null; }
  };

  // ── Fetch weather by GPS for schedule ──
  const fetchWeatherByGPS = async () => {
    setWeatherLoading(true);
    setFormWeather(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission denied', 'Please enter venue name and use By City instead.');
        setWeatherLoading(false);
        return;
      }
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const { latitude, longitude } = loc.coords;

      // Reverse geocode to get area name
      const [place] = await Location.reverseGeocodeAsync({ latitude, longitude });
      const rawName = place?.district || place?.subregion || place?.name || '';
      const city = place?.city || place?.region || '';
      const words = rawName.trim().split(' ');
      const shortArea = words.length > 2 ? words.slice(0, 2).join(' ') : rawName;
      const areaName = shortArea + (city ? ', ' + city : '');

      // Fetch weather
      const url = `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current=temperature_2m,relative_humidity_2m,wind_speed_10m,weather_code,apparent_temperature&wind_speed_unit=kmh`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.current) {
        const info = getWeatherInfo(data.current.weather_code);
        const w = {
          temp: Math.round(data.current.temperature_2m),
          feelsLike: Math.round(data.current.apparent_temperature),
          humidity: data.current.relative_humidity_2m,
          wind: Math.round(data.current.wind_speed_10m),
          city: areaName,
          ...info,
        };
        setFormWeather(w);
        setVenue(areaName);
        if (info.bad) {
          Alert.alert('⚠️ Weather Warning', info.alert || 'Bad weather at your location!');
        } else {
          Alert.alert('✅ Good Conditions!', `${info.icon} ${info.desc} at ${areaName}. Great for cricket!`);
        }
      }
    } catch (e) {
      Alert.alert('Error', 'Could not get location: ' + e.message);
    }
    setWeatherLoading(false);
  };

  const handleCheckWeather = async () => {
    if (!venue.trim()) {
      Alert.alert('Missing', 'Please enter a venue first.'); return;
    }
    setWeatherLoading(true);
    const weather = await fetchWeatherForCity(venue);
    if (weather) {
      setFormWeather(weather);
      if (weather.bad) Alert.alert('⚠️ Weather Warning', weather.alert);
      else Alert.alert('✅ Good Conditions', `${weather.icon} ${weather.desc} at ${weather.city}`);
    } else {
      Alert.alert('Not found', 'Could not find weather for this location.');
    }
    setWeatherLoading(false);
  };

  // ── Auto check weather for today's matches ──
  const checkWeatherAlerts = async () => {
    try {
      const data = await AsyncStorage.getItem('scheduledMatches');
      if (!data) return;
      const saved = JSON.parse(data);
      for (const m of saved) {
        if (!m.venue) continue;
        const matchDate = new Date(m.date);
        const today = new Date();
        const daysUntil = Math.ceil((matchDate - today) / (1000 * 60 * 60 * 24));
        if (daysUntil > 2 || daysUntil < 0) continue; // Only check matches in next 2 days
        const weather = await fetchWeatherForCity(m.venue);
        if (weather?.bad) await notifyWeather(m, weather);
      }
    } catch (e) { console.log('weather alert check:', e); }
  };

  // ── Refresh weather for a specific match ──
  const refreshWeatherForMatch = async (m) => {
    const weather = await fetchWeatherForCity(m.venue);
    if (!weather) { Alert.alert('Error', 'Could not fetch weather.'); return; }
    const updated = matches.map(x => x.id === m.id ? { ...x, weather } : x);
    await saveMatches(updated);
    setShowDetailModal({ ...m, weather });
    if (weather.bad) Alert.alert('⚠️ Weather Alert', weather.alert);
    else Alert.alert('✅ Good Conditions', `${weather.icon} ${weather.desc}. Great for cricket!`);
  };

  // ── Add player ──
  const addPlayer = () => {
    const name = newPlayer.trim();
    if (!name) return;
    if (players.includes(name)) { Alert.alert('Duplicate', `${name} already added.`); return; }
    setPlayers(prev => [...prev, name]);
    setNewPlayer('');
  };

  // ── Save scheduled match ──
  const saveScheduledMatch = async () => {
    if (!teamA.trim() || !teamB.trim()) { Alert.alert('Missing', 'Enter both team names.'); return; }
    if (!matchDate.trim()) { Alert.alert('Missing', 'Enter match date.'); return; }
    if (!venue.trim()) { Alert.alert('Missing', 'Enter venue.'); return; }

    const newMatch = {
      id: Date.now().toString(),
      teamA: teamA.trim(),
      teamB: teamB.trim(),
      venue: venue.trim(),
      date: matchDate.trim(),
      time: matchTime.trim(),
      overs: overs,
      players: players,
      attendance: {},
      weather: formWeather,
      createdAt: Date.now(),
    };

    // Schedule 1hr reminder
    const reminderId = await scheduleMatchReminder(newMatch);
    if (reminderId) newMatch.reminderId = reminderId;

    const updated = [newMatch, ...matches];
    await saveMatches(updated);
    setShowAddModal(false);
    setTeamA(''); setTeamB(''); setMatchDate(''); setMatchTime('');
    setVenue(''); setOvers('10'); setPlayers([]);
    setFormWeather(null);
    Alert.alert(
      'Scheduled ✅',
      `${newMatch.teamA} vs ${newMatch.teamB} on ${newMatch.date}${reminderId ? '\n\n🔔 Reminder set for 1 hour before match' : ''}`
    );
  };

  // ── Delete match ──
  const deleteMatch = async (m) => {
    Alert.alert('Delete', 'Remove this scheduled match?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete', style: 'destructive',
        onPress: async () => {
          const Notif = getNotif();
          if (m.reminderId && Notif) {
            await Notif.cancelScheduledNotificationAsync(m.reminderId).catch(() => {});
          }
          const updated = matches.filter(x => x.id !== m.id);
          await saveMatches(updated);
          setShowDetailModal(null);
        }
      }
    ]);
  };

  // ── Toggle attendance ──
  const toggleAttendance = async (matchId, player) => {
    const updated = matches.map(m => {
      if (m.id !== matchId) return m;
      const att = { ...m.attendance };
      // Cycle: undefined → present → absent → present
      if (att[player] === undefined) att[player] = true;
      else if (att[player] === true) att[player] = false;
      else att[player] = true;
      return { ...m, attendance: att };
    });
    await saveMatches(updated);
    setShowDetailModal(updated.find(m => m.id === matchId));
  };

  // ── Start match from schedule ──
  const addPlayerToScheduledMatch = async (matchId) => {
    const name = detailNewPlayer.trim();
    if (!name) return;

    const match = matches.find(m => m.id === matchId);
    if (!match) return;
    if (match.players.some(p => p.toLowerCase() === name.toLowerCase())) {
      Alert.alert('Duplicate', `${name} already added.`);
      return;
    }

    const updated = matches.map(m => {
      if (m.id !== matchId) return m;
      return {
        ...m,
        players: [...m.players, name],
        attendance: { ...m.attendance, [name]: true },
      };
    });

    await saveMatches(updated);
    setShowDetailModal(updated.find(m => m.id === matchId));
    setDetailNewPlayer('');
  };

  const removePlayerFromScheduledMatch = async (matchId, player) => {
    const updated = matches.map(m => {
      if (m.id !== matchId) return m;
      const attendance = { ...m.attendance };
      delete attendance[player];
      return {
        ...m,
        players: m.players.filter(p => p !== player),
        attendance,
      };
    });

    await saveMatches(updated);
    setShowDetailModal(updated.find(m => m.id === matchId));
  };

  const startFromSchedule = (m) => {
    const absentPlayers = m.players.filter(p => m.attendance[p] === false);
    const doStart = () => {
      const presentPlayers = m.players.filter(p => m.attendance[p] !== false);
      const pool = presentPlayers.length >= 2 ? presentPlayers : m.players;
      const half = Math.ceil(pool.length / 2);
      setShowDetailModal(null);
      router.push({
        pathname: '/scoring',
        params: {
          matchSetup: JSON.stringify({
            teamA: { name: m.teamA, players: pool.slice(0, half) },
            teamB: { name: m.teamB, players: pool.slice(half) },
            battingTeam: m.teamA,
            battingPlayers: pool.slice(0, half),
            bowlingPlayers: pool.slice(half),
            totalOvers: Number(m.overs) || 10,
            venue: m.venue,
            matchDate: m.date,
            matchTime: m.time,
          })
        }
      });
    };

    if (absentPlayers.length > 0) {
      Alert.alert(
        '⚠️ Absent Players',
        `${absentPlayers.join(', ')} marked absent.\n\nContinue without them?`,
        [{ text: 'Cancel', style: 'cancel' }, { text: 'Continue', onPress: doStart }]
      );
    } else {
      doStart();
    }
  };

  const isToday = (d) => d && new Date(d).toDateString() === new Date().toDateString();
  const isPast = (d) => d && new Date(d) < new Date() && !isToday(d);

  // ────────────────────────────────────────────────────────────────
  // DETAIL MODAL
  // ────────────────────────────────────────────────────────────────
  const renderDetailModal = () => {
    const m = showDetailModal;
    if (!m) return null;
    const presentCount = m.players.filter(p => m.attendance[p] !== false).length;
    const absentCount = m.players.filter(p => m.attendance[p] === false).length;

    return (
      <Modal visible transparent animationType="slide">
        <View style={styles.overlay}>
          <View style={styles.sheet}>
            <ScrollView showsVerticalScrollIndicator={false}>

              {/* Header */}
              <View style={styles.detailHeader}>
                <View style={styles.vsRow}>
                  <Text style={styles.detailTeam}>{m.teamA}</Text>
                  <View style={styles.vsCircle}><Text style={styles.vsText}>VS</Text></View>
                  <Text style={[styles.detailTeam, { textAlign: 'right' }]}>{m.teamB}</Text>
                </View>
                <Text style={styles.detailMeta}>📍 {m.venue}</Text>
                <Text style={styles.detailMeta}>📅 {m.date}  🕐 {m.time || 'TBD'}</Text>
                <Text style={styles.detailMeta}>🏏 {m.overs} overs</Text>
                {isToday(m.date) && <View style={styles.todayBadge}><Text style={styles.todayText}>TODAY</Text></View>}
              </View>

              {/* Weather */}
              <View style={styles.section}>
                <View style={styles.sectionTitleRow}>
                  <Text style={styles.sectionTitle}>🌤 Weather</Text>
                  <TouchableOpacity onPress={() => refreshWeatherForMatch(m)} style={styles.refreshBtn}>
                    <Text style={styles.refreshBtnText}>↻ Refresh</Text>
                  </TouchableOpacity>
                </View>
                {m.weather ? (
                  <View style={[styles.weatherCard, m.weather.bad && styles.weatherCardBad]}>
                    <View style={styles.weatherRow}>
                      <Text style={styles.weatherTemp}>{m.weather.temp}°C</Text>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.weatherDesc}>{m.weather.icon} {m.weather.desc}</Text>
                        <Text style={styles.weatherCity}>📍 {m.weather.city || m.venue}</Text>
                      </View>
                      <Text style={{ color: m.weather.bad ? '#ef4444' : '#22c55e', fontWeight: 'bold' }}>
                        {m.weather.bad ? '⚠️ Bad' : '✅ Good'}
                      </Text>
                    </View>
                    <View style={{ flexDirection: 'row', gap: 20, marginTop: 4 }}>
                      <Text style={styles.weatherMeta}>💧 {m.weather.humidity}% humidity</Text>
                      <Text style={styles.weatherMeta}>💨 {m.weather.wind} km/h wind</Text>
                    </View>
                    {m.weather.bad && m.weather.alert && (
                      <View style={styles.weatherAlertBox}>
                        <Text style={styles.weatherAlertText}>⚠️ {m.weather.alert}</Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <Text style={styles.noData}>No weather data — tap Refresh</Text>
                )}
              </View>

              {/* Attendance */}
              <View style={styles.section}>
                <Text style={styles.sectionTitle}>
                  Players - {presentCount}/{m.players.length} present
                </Text>
                <View style={styles.addRow}>
                  <TextInput
                    style={[styles.input, { flex: 1, marginBottom: 0 }]}
                    value={detailNewPlayer}
                    onChangeText={setDetailNewPlayer}
                    placeholder="Add player"
                    placeholderTextColor="#475569"
                    onSubmitEditing={() => addPlayerToScheduledMatch(m.id)}
                    blurOnSubmit={false}
                    returnKeyType="done"
                  />
                  <TouchableOpacity style={styles.addBtn} onPress={() => addPlayerToScheduledMatch(m.id)}>
                    <Text style={styles.addBtnText}>+ Add</Text>
                  </TouchableOpacity>
                </View>

                {absentCount > 0 && (
                  <View style={[styles.absentAlert, { marginTop: 10 }]}>
                    <Text style={styles.absentAlertText}>{absentCount} player{absentCount > 1 ? 's' : ''} marked absent</Text>
                  </View>
                )}

                {m.players.length === 0 && (
                  <Text style={styles.noData}>No players added yet.</Text>
                )}

                {m.players.map((p, i) => {
                  const status = m.attendance[p];
                  const isPresent = status !== false;
                  const isMarked = status !== undefined;
                  return (
                    <View key={i} style={styles.playerEditRow}>
                      <TouchableOpacity style={styles.attendanceToggle}
                        onPress={() => toggleAttendance(m.id, p)}>
                        <View style={[styles.attDot, {
                          backgroundColor: !isMarked ? '#475569' : isPresent ? '#22c55e' : '#ef4444'
                        }]} />
                        <Text style={[styles.playerName, !isPresent && { color: '#64748b' }]}>{p}</Text>
                        <Text style={[styles.attStatus, {
                          color: !isMarked ? '#475569' : isPresent ? '#22c55e' : '#ef4444'
                        }]}>
                          {!isMarked ? 'Tap to mark' : isPresent ? 'Present' : 'Absent'}
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={styles.removePlayerBtn}
                        onPress={() => removePlayerFromScheduledMatch(m.id, p)}>
                        <Text style={styles.removePlayerText}>X</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </View>

              {false && m.players.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>
                    👥 Attendance — {presentCount}/{m.players.length} present
                  </Text>
                  {absentCount > 0 && (
                    <View style={styles.absentAlert}>
                      <Text style={styles.absentAlertText}>⚠️ {absentCount} player{absentCount > 1 ? 's' : ''} marked absent</Text>
                    </View>
                  )}
                  {m.players.map((p, i) => {
                    const status = m.attendance[p];
                    const isPresent = status !== false;
                    const isMarked = status !== undefined;
                    return (
                      <TouchableOpacity key={i} style={styles.playerRow}
                        onPress={() => toggleAttendance(m.id, p)}>
                        <View style={[styles.attDot, {
                          backgroundColor: !isMarked ? '#475569' : isPresent ? '#22c55e' : '#ef4444'
                        }]} />
                        <Text style={[styles.playerName, !isPresent && { color: '#64748b' }]}>{p}</Text>
                        <Text style={[styles.attStatus, {
                          color: !isMarked ? '#475569' : isPresent ? '#22c55e' : '#ef4444'
                        }]}>
                          {!isMarked ? 'Tap to mark' : isPresent ? 'Present ✓' : 'Absent ✗'}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}

              {/* Action buttons */}
              <TouchableOpacity style={styles.startBtn} onPress={() => startFromSchedule(m)}>
                <Text style={styles.startBtnText}>🏏 {isPast(m.date) ? 'Score This Match' : 'Start Match'}</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.deleteBtn} onPress={() => deleteMatch(m)}>
                <Text style={styles.deleteBtnText}>🗑 Delete Match</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.closeBtn} onPress={() => { setShowDetailModal(null); setDetailNewPlayer(''); }}>
                <Text style={styles.closeBtnText}>Close</Text>
              </TouchableOpacity>

            </ScrollView>
          </View>
        </View>
      </Modal>
    );
  };

  // ────────────────────────────────────────────────────────────────
  // ADD MODAL
  // ────────────────────────────────────────────────────────────────
  const renderAddModal = () => (
    <Modal visible={showAddModal} transparent animationType="slide">
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.overlay}>
          <View style={[styles.sheet, { maxHeight: '95%' }]}>
            <ScrollView keyboardShouldPersistTaps="handled" keyboardDismissMode="none" showsVerticalScrollIndicator={false}>
              <Text style={styles.sheetTitle}>📅 Schedule New Match</Text>

              <Text style={styles.label}>Team A</Text>
              <TextInput style={styles.input} value={teamA}
                onChangeText={setTeamA}
                placeholder="e.g. Pindi Lions" placeholderTextColor="#475569" returnKeyType="next" />

              <Text style={styles.label}>Team B</Text>
              <TextInput style={styles.input} value={teamB}
                onChangeText={setTeamB}
                placeholder="e.g. Sky Warriors" placeholderTextColor="#475569" returnKeyType="next" />

              <Text style={styles.label}>Match Date</Text>
              <TextInput style={styles.input} value={matchDate}
                onChangeText={setMatchDate}
                placeholder="e.g. 2026-05-10" placeholderTextColor="#475569" returnKeyType="next" />

              <Text style={styles.label}>Match Time</Text>
              <TextInput style={styles.input} value={matchTime}
                onChangeText={setMatchTime}
                placeholder="e.g. 06:00 AM" placeholderTextColor="#475569" returnKeyType="next" />

              <Text style={styles.label}>Venue</Text>
              <TextInput style={styles.input} value={venue}
                onChangeText={setVenue}
                placeholder="e.g. Saddar Ground, Rawalpindi"
                placeholderTextColor="#475569" returnKeyType="done" />

              <Text style={styles.label}>Overs</Text>
              <View style={styles.oversRow}>
                {['5', '10', '20', '50'].map(o => (
                  <TouchableOpacity key={o}
                    style={[styles.oversChip, overs === o && styles.oversChipActive]}
                    onPress={() => setOvers(o)}>
                    <Text style={[styles.oversChipText, overs === o && { color: '#0f172a' }]}>{o}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              {/* Weather check - GPS + City */}
              <View style={{ flexDirection: 'row', gap: 8, marginVertical: 6 }}>
                <TouchableOpacity
                  style={[styles.weatherCheckBtn, { flex: 1 }]}
                  onPress={fetchWeatherByGPS}>
                  <Text style={styles.weatherCheckText}>
                    {weatherLoading ? '⏳...' : '📍 My Location'}
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.weatherCheckBtn, { flex: 1 }]}
                  onPress={handleCheckWeather}>
                  <Text style={styles.weatherCheckText}>
                    {weatherLoading ? '⏳...' : '🌤 By City'}
                  </Text>
                </TouchableOpacity>
              </View>
              {formWeather && (
                <View style={[styles.weatherCard, formWeather.bad && styles.weatherCardBad]}>
                  <Text style={styles.weatherDesc}>{formWeather.icon} {formWeather.desc} — {formWeather.temp}°C</Text>
                  <Text style={styles.weatherCity}>📍 {formWeather.city}</Text>
                  {formWeather.bad && <Text style={[styles.weatherAlertText, { marginTop: 4 }]}>⚠️ {formWeather.alert}</Text>}
                </View>
              )}

              {/* Players */}
              <Text style={styles.label}>Players ({players.length})</Text>
              <View style={styles.addRow}>
                <TextInput
                  style={[styles.input, { flex: 1, marginBottom: 0 }]}
                  value={newPlayer} onChangeText={setNewPlayer}
                  placeholder="Player name" placeholderTextColor="#475569"
                  onSubmitEditing={addPlayer} blurOnSubmit={false} returnKeyType="done" />
                <TouchableOpacity style={styles.addBtn} onPress={addPlayer}>
                  <Text style={styles.addBtnText}>+ Add</Text>
                </TouchableOpacity>
              </View>
              {players.map((p, i) => (
                <View key={i} style={styles.playerRow}>
                  <View style={[styles.attDot, { backgroundColor: '#38bdf8' }]} />
                  <Text style={styles.playerName}>{p}</Text>
                  <TouchableOpacity onPress={() => setPlayers(prev => prev.filter(x => x !== p))}>
                    <Text style={{ color: '#ef4444', fontSize: 16, paddingHorizontal: 8 }}>✕</Text>
                  </TouchableOpacity>
                </View>
              ))}

              <View style={{ flexDirection: 'row', gap: 10, marginTop: 20 }}>
                <TouchableOpacity style={[styles.closeBtn, { flex: 1 }]}
                  onPress={() => {
                    setShowAddModal(false);
                    setTeamA(''); setTeamB(''); setMatchDate(''); setMatchTime('');
                    setVenue(''); setOvers('10'); setPlayers([]);
                    setFormWeather(null);
                  }}>
                  <Text style={styles.closeBtnText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity style={[styles.startBtn, { flex: 2 }]} onPress={saveScheduledMatch}>
                  <Text style={styles.startBtnText}>Save & Schedule</Text>
                </TouchableOpacity>
              </View>
              <View style={{ height: 20 }} />
            </ScrollView>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );

  // ── Sort: today first, upcoming, then past ──
  const sorted = [...matches].sort((a, b) => {
    const ta = isToday(a.date), tb = isToday(b.date);
    if (ta && !tb) return -1;
    if (!ta && tb) return 1;
    return new Date(a.date) - new Date(b.date);
  });

  return (
    <View style={styles.container}>
      {renderDetailModal()}
      {renderAddModal()}

      <View style={styles.header}>
        <Text style={styles.title}>📅 Schedule</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => setShowAddModal(true)}>
          <Text style={styles.newBtnText}>+ New Match</Text>
        </TouchableOpacity>
      </View>

      <ScrollView
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38bdf8" />}
        contentContainerStyle={matches.length === 0 && { flex: 1, justifyContent: 'center' }}
      >
        {matches.length === 0 ? (
          <View style={styles.empty}>
            <Text style={{ fontSize: 48, marginBottom: 16 }}>📅</Text>
            <Text style={styles.emptyTitle}>No matches scheduled</Text>
            <Text style={styles.emptySub}>Tap &quot;+ New Match&quot; to schedule upcoming matches</Text>
            <TouchableOpacity style={[styles.startBtn, { marginTop: 24, paddingHorizontal: 32 }]}
              onPress={() => setShowAddModal(true)}>
              <Text style={styles.startBtnText}>Schedule First Match</Text>
            </TouchableOpacity>
          </View>
        ) : sorted.map(m => {
          const today = isToday(m.date);
          const past = isPast(m.date);
          const presentCount = m.players.filter(p => m.attendance[p] !== false).length;
          const absentCount = m.players.filter(p => m.attendance[p] === false).length;

          return (
            <TouchableOpacity key={m.id}
              style={[styles.card, today && styles.cardToday, past && { opacity: 0.55 }]}
              onPress={() => setShowDetailModal(m)}>
              {today && <View style={styles.todayBadge}><Text style={styles.todayText}>TODAY</Text></View>}
              <View style={styles.cardTeamRow}>
                <Text style={styles.cardTeam}>{m.teamA}</Text>
                <View style={styles.cardVs}><Text style={styles.cardVsText}>VS</Text></View>
                <Text style={[styles.cardTeam, { textAlign: 'right' }]}>{m.teamB}</Text>
              </View>
              <Text style={styles.cardMeta}>📅 {m.date}  {m.time ? `🕐 ${m.time}` : ''}  📍 {m.venue}</Text>
              <View style={styles.cardBadges}>
                {m.weather && (
                  <View style={[styles.badge, m.weather.bad && { backgroundColor: '#7f1d1d' }]}>
                    <Text style={styles.badgeText}>{m.weather.icon} {m.weather.temp}°C {m.weather.bad ? '⚠️' : '✅'}</Text>
                  </View>
                )}
                {m.players.length > 0 && (
                  <View style={[styles.badge, { backgroundColor: '#1e3a5f' }]}>
                    <Text style={styles.badgeText}>
                      👥 {m.players.length > 0 ? `${presentCount}/${m.players.length}` : '0'} present
                      {absentCount > 0 ? ` · ${absentCount} absent` : ''}
                    </Text>
                  </View>
                )}
                <View style={[styles.badge, { backgroundColor: '#1a2e1a', marginLeft: 'auto' }]}>
                  <Text style={styles.badgeText}>{m.overs} ov</Text>
                </View>
              </View>
            </TouchableOpacity>
          );
        })}
        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f172a', paddingHorizontal: 16, paddingTop: 16 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  title: { fontSize: 22, color: '#fff', fontWeight: 'bold' },
  newBtn: { backgroundColor: '#38bdf8', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 10 },
  newBtnText: { color: '#0f172a', fontWeight: 'bold', fontSize: 13 },

  card: { backgroundColor: '#1e293b', borderRadius: 14, padding: 14, marginBottom: 10, borderWidth: 0.5, borderColor: '#334155' },
  cardToday: { borderColor: '#38bdf8', borderWidth: 1.5 },
  todayBadge: { backgroundColor: '#38bdf8', alignSelf: 'flex-start', paddingHorizontal: 10, paddingVertical: 3, borderRadius: 20, marginBottom: 8 },
  todayText: { color: '#0f172a', fontSize: 11, fontWeight: 'bold' },
  cardTeamRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 6 },
  cardTeam: { flex: 1, color: '#fff', fontWeight: 'bold', fontSize: 15 },
  cardVs: { width: 26, height: 26, borderRadius: 13, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center', marginHorizontal: 8 },
  cardVsText: { color: '#64748b', fontSize: 9, fontWeight: 'bold' },
  cardMeta: { color: '#64748b', fontSize: 12, marginBottom: 8 },
  cardBadges: { flexDirection: 'row', gap: 6, flexWrap: 'wrap', alignItems: 'center' },
  badge: { backgroundColor: '#1a3a2a', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 20 },
  badgeText: { color: '#fff', fontSize: 11 },

  empty: { alignItems: 'center', paddingVertical: 60 },
  emptyTitle: { color: '#fff', fontSize: 20, fontWeight: 'bold', marginBottom: 8 },
  emptySub: { color: '#475569', fontSize: 14, textAlign: 'center' },

  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, maxHeight: '90%' },
  sheetTitle: { color: '#fff', fontWeight: 'bold', fontSize: 18, marginBottom: 16, textAlign: 'center' },

  detailHeader: { backgroundColor: '#0f172a', borderRadius: 12, padding: 14, marginBottom: 14, alignItems: 'center' },
  vsRow: { flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 8 },
  detailTeam: { flex: 1, color: '#fff', fontWeight: 'bold', fontSize: 16 },
  vsCircle: { width: 34, height: 34, borderRadius: 17, backgroundColor: '#334155', justifyContent: 'center', alignItems: 'center', marginHorizontal: 8 },
  vsText: { color: '#64748b', fontSize: 10, fontWeight: 'bold' },
  detailMeta: { color: '#64748b', fontSize: 13, marginTop: 3 },

  section: { marginBottom: 16 },
  sectionTitleRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
  refreshBtn: { backgroundColor: '#1e3a5f', paddingHorizontal: 12, paddingVertical: 5, borderRadius: 8 },
  refreshBtnText: { color: '#38bdf8', fontSize: 12, fontWeight: '600' },
  noData: { color: '#475569', fontSize: 13, textAlign: 'center', padding: 10 },

  weatherCard: { backgroundColor: '#0f172a', borderRadius: 12, padding: 12, marginTop: 4 },
  weatherCardBad: { borderColor: '#ef4444', borderWidth: 1 },
  weatherRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 6 },
  weatherTemp: { color: '#38bdf8', fontSize: 26, fontWeight: 'bold' },
  weatherDesc: { color: '#fff', fontSize: 13, fontWeight: '600' },
  weatherCity: { color: '#64748b', fontSize: 11, marginTop: 2 },
  weatherMeta: { color: '#64748b', fontSize: 12 },
  weatherAlertBox: { backgroundColor: '#7f1d1d', borderRadius: 8, padding: 8, marginTop: 8 },
  weatherAlertText: { color: '#fca5a5', fontSize: 12 },
  weatherCheckBtn: { backgroundColor: '#0f172a', borderWidth: 1, borderColor: '#38bdf8', borderRadius: 10, padding: 12, alignItems: 'center', marginVertical: 8 },
  weatherCheckText: { color: '#38bdf8', fontWeight: '600', fontSize: 13 },

  absentAlert: { backgroundColor: '#7f1d1d', borderRadius: 8, padding: 8, marginBottom: 8 },
  absentAlertText: { color: '#fca5a5', fontSize: 12 },
  playerRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 0.5, borderBottomColor: '#334155' },
  playerEditRow: { flexDirection: 'row', alignItems: 'center', gap: 8, borderBottomWidth: 0.5, borderBottomColor: '#334155' },
  attendanceToggle: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8 },
  removePlayerBtn: { width: 34, height: 34, borderRadius: 8, backgroundColor: '#7f1d1d', alignItems: 'center', justifyContent: 'center' },
  removePlayerText: { color: '#fca5a5', fontSize: 14, fontWeight: 'bold' },
  attDot: { width: 10, height: 10, borderRadius: 5, flexShrink: 0 },
  playerName: { flex: 1, color: '#e2e8f0', fontSize: 14 },
  attStatus: { fontSize: 12, fontWeight: '600' },

  startBtn: { backgroundColor: '#22c55e', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 10 },
  startBtnText: { color: '#0f172a', fontWeight: 'bold', fontSize: 15 },
  deleteBtn: { backgroundColor: '#7f1d1d', padding: 12, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  deleteBtnText: { color: '#fca5a5', fontWeight: 'bold', fontSize: 14 },
  closeBtn: { backgroundColor: '#334155', padding: 12, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  closeBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },

  label: { color: '#94a3b8', fontSize: 13, marginBottom: 6, marginTop: 12 },
  input: { backgroundColor: '#0f172a', color: '#fff', padding: 12, borderRadius: 10, borderWidth: 0.5, borderColor: '#334155', fontSize: 14 },
  addRow: { flexDirection: 'row', gap: 8, marginTop: 6 },
  addBtn: { backgroundColor: '#38bdf8', paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10, justifyContent: 'center' },
  addBtnText: { color: '#0f172a', fontWeight: 'bold', fontSize: 13 },
  oversRow: { flexDirection: 'row', gap: 8, marginBottom: 4, marginTop: 6 },
  oversChip: { flex: 1, padding: 10, borderRadius: 10, borderWidth: 1, borderColor: '#334155', alignItems: 'center' },
  oversChipActive: { backgroundColor: '#38bdf8', borderColor: '#38bdf8' },
  oversChipText: { color: '#94a3b8', fontWeight: 'bold' },
});
