import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import React, { useCallback, useState } from 'react';
import {
  View, Text, StyleSheet, ScrollView,
  TouchableOpacity, Share, Alert, Modal, ActivityIndicator
} from 'react-native';
import { useFocusEffect, useLocalSearchParams } from 'expo-router';

export default function ScorecardScreen() {
  const [matchData, setMatchData] = useState(null);
  const [firstInnings, setFirstInnings] = useState(null);
  const [matchResult, setMatchResult] = useState(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // Read result passed directly from scoring screen
  const params = useLocalSearchParams();

  useFocusEffect(useCallback(() => { loadData(); }, []));

  const loadData = async () => {
    try {
      const data = await AsyncStorage.getItem('currentMatch');
      if (data) setMatchData(JSON.parse(data));
      const fi = await AsyncStorage.getItem('firstInnings');
      if (fi) setFirstInnings(JSON.parse(fi));

      // First try params passed from scoring screen (most reliable)
      if (params?.resultData) {
        try {
          const parsed = JSON.parse(params.resultData);
          setMatchResult(parsed);
          // Also save to AsyncStorage for next time
          await AsyncStorage.setItem('matchResult', JSON.stringify(parsed));
        } catch (e) { console.log('params parse error:', e); }
      } else {
        // Fallback: read from AsyncStorage
        const result = await AsyncStorage.getItem('matchResult');
        if (result) setMatchResult(JSON.parse(result));
      }
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
      if (score > bestScore) { bestScore = score; best = { name, runs: bat.runs, balls: bat.balls, wickets: bowl.wickets }; }
    });
    return best;
  };

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
          const r = balls.reduce((sum, b) => b.type === 'run' ? sum + b.run : ['wide', 'noBall'].includes(b.type) ? sum + 1 : sum, 0);
          if (r === 0) maidens++;
        }
      });
      return { name, overs, maidens, runs: s.runs, wickets: s.wickets, eco };
    });
  };

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

  const buildFOW = (history) => history.filter(b => b.type === 'wicket').map((w, i) => ({
    num: i + 1, over: w.over, batsman: w.striker,
  }));

  const getOvers = (balls) => `${Math.floor(balls / 6)}.${balls % 6}`;
  const runRate = match.balls > 0 ? (match.runs / (match.balls / 6)).toFixed(2) : '0.00';

  const batting2 = buildBattingCard(batsmenStats, ballHistory, match.striker);
  const bowling2 = buildBowlingCard(bowlerStats, ballHistory);
  const extras2 = buildExtras(ballHistory);
  const fow2 = buildFOW(ballHistory);
  const fi = firstInnings;
  const fiHistory = fi ? [...(fi.ballHistory || [])].reverse() : [];
  const batting1 = fi ? buildBattingCard(fi.batsmenStats || {}, fiHistory, '') : [];
  const bowling1 = fi ? buildBowlingCard(fi.bowlerStats || {}, fiHistory) : [];
  const extras1 = fi ? buildExtras(fiHistory) : null;
  const fow1 = fi ? buildFOW(fiHistory) : [];
  const motm = getMotm();

  // ── Compute result from scores if matchResult not in state ──
  const getComputedResult = () => {
    if (matchResult?.resultText) return matchResult;
    if (!fi) return null;
    const target = fi.runs + 1;
    if (match.runs >= target) {
      const wicketsLeft = 10 - match.wickets;
      const margin = `${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}`;
      return { winner: match.battingTeam, loser: fi.team, margin, resultType: 'wickets',
        resultText: `${match.battingTeam} won by ${margin}`,
        firstTeam: fi.team, firstScore: `${fi.runs}/${fi.wickets}`,
        secondTeam: match.battingTeam, secondScore: `${match.runs}/${match.wickets}` };
    } else if (match.runs === fi.runs) {
      return { resultType: 'tie', resultText: 'Match Tied!',
        firstTeam: fi.team, firstScore: `${fi.runs}/${fi.wickets}`,
        secondTeam: match.battingTeam, secondScore: `${match.runs}/${match.wickets}` };
    } else {
      const runsShort = target - 1 - match.runs;
      const margin = `${runsShort} run${runsShort !== 1 ? 's' : ''}`;
      return { winner: fi.team, loser: match.battingTeam, margin, resultType: 'runs',
        resultText: `${fi.team} won by ${margin}`,
        firstTeam: fi.team, firstScore: `${fi.runs}/${fi.wickets}`,
        secondTeam: match.battingTeam, secondScore: `${match.runs}/${match.wickets}` };
    }
  };
  const computedResult = getComputedResult();

  // ── SHORT SUMMARY SHARE ──
  const shareShortSummary = async () => {
    const line = '━'.repeat(28);
    const result = matchResult;
    let text = `🏏 *CRICKET MATCH RESULT*\n${line}\n`;

    // ── Calculate result if not in state ──
    let resultLine = '';
    if (result && result.resultText) {
      resultLine = result.resultText;
    } else if (fi) {
      // Calculate manually from scores
      const target = fi.runs + 1;
      if (match.runs >= target) {
        const wicketsLeft = 10 - match.wickets;
        resultLine = `${match.battingTeam} won by ${wicketsLeft} wicket${wicketsLeft !== 1 ? 's' : ''}`;
      } else if (match.runs === fi.runs) {
        resultLine = 'Match Tied!';
      } else {
        const runsShort = target - 1 - match.runs;
        resultLine = `${fi.team} won by ${runsShort} run${runsShort !== 1 ? 's' : ''}`;
      }
    }

    if (resultLine) {
      text += `\n🏆 *${resultLine}*\n`;
      text += `${line}\n`;
    }

    if (fi) {
      text += `\n📊 *1st Innings — ${fi.team}*\n`;
      text += `${fi.runs}/${fi.wickets} (${getOvers(fi.balls)} ov)\n`;
      const top1 = Object.entries(fi.batsmenStats || {}).sort((a, b) => b[1].runs - a[1].runs)[0];
      if (top1) text += `⭐ ${top1[0]}: ${top1[1].runs} (${top1[1].balls}b)\n`;
    }

    text += `\n📊 *2nd Innings — ${match.battingTeam}*\n`;
    text += `${match.runs}/${match.wickets} (${getOvers(match.balls)} ov)\n`;
    const top2 = batting2.sort((a, b) => b.runs - a.runs)[0];
    if (top2) text += `⭐ ${top2.name}: ${top2.runs} (${top2.balls}b)\n`;
    const bestBowl = bowling2.sort((a, b) => b.wickets - a.wickets)[0];
    if (bestBowl && bestBowl.wickets > 0) text += `🎳 ${bestBowl.name}: ${bestBowl.wickets}/${bestBowl.runs}\n`;

    if (motm) {
      text += `\n${line}\n`;
      text += `🌟 *Man of the Match: ${motm.name}*\n`;
      if (motm.runs > 0) text += `${motm.runs} runs (${motm.balls}b)`;
      if (motm.runs > 0 && motm.wickets > 0) text += ` · `;
      if (motm.wickets > 0) text += `${motm.wickets} wickets`;
      text += `\n`;
    }

    if (match.venue) text += `\n📍 ${match.venue}`;
    if (match.matchDate) text += `\n📅 ${match.matchDate} ${match.matchTime || ''}`;
    text += `\n\n_Scored with CricScore App_ 🏏`;

    try {
      await Share.share({ message: text, title: 'Match Result' });
    } catch (e) { Alert.alert('Error', 'Could not share.'); }
    setShowShareModal(false);
  };

  // ── FULL PDF SCORECARD ──
  const generatePDF = async () => {
    setPdfLoading(true);
    setShowShareModal(false);

    const battingRowsHTML = (rows) => rows.map((b, i) => `
      <tr style="background:${i % 2 === 0 ? '#1e293b' : '#162032'}">
        <td style="padding:8px 10px;color:${b.dismissal === 'batting *' ? '#38bdf8' : '#e2e8f0'};font-size:13px;font-weight:${b.dismissal === 'batting *' ? 'bold' : 'normal'}">${b.name}${b.dismissal === 'batting *' ? ' *' : ''}</td>
        <td style="padding:8px 6px;color:#64748b;font-size:11px;font-style:italic">${b.dismissal}</td>
        <td style="padding:8px 10px;color:${b.runs >= 50 ? '#f59e0b' : '#fff'};font-weight:bold;text-align:center">${b.runs}</td>
        <td style="padding:8px 10px;color:#94a3b8;text-align:center">${b.balls}</td>
        <td style="padding:8px 10px;color:#22c55e;text-align:center">${b.fours}</td>
        <td style="padding:8px 10px;color:#a855f7;text-align:center">${b.sixes}</td>
        <td style="padding:8px 10px;color:#94a3b8;text-align:center">${b.sr}</td>
      </tr>`).join('');

    const bowlingRowsHTML = (rows) => rows.map((b, i) => `
      <tr style="background:${i % 2 === 0 ? '#1e293b' : '#162032'}">
        <td style="padding:8px 10px;color:#f59e0b;font-size:13px">${b.name}</td>
        <td style="padding:8px 10px;color:#94a3b8;text-align:center">${b.overs}</td>
        <td style="padding:8px 10px;color:#94a3b8;text-align:center">${b.maidens}</td>
        <td style="padding:8px 10px;color:#94a3b8;text-align:center">${b.runs}</td>
        <td style="padding:8px 10px;color:${b.wickets >= 3 ? '#ef4444' : '#fff'};font-weight:bold;text-align:center">${b.wickets}</td>
        <td style="padding:8px 10px;color:${parseFloat(b.eco) <= 6 ? '#22c55e' : parseFloat(b.eco) <= 10 ? '#f59e0b' : '#ef4444'};text-align:center">${b.eco}</td>
      </tr>`).join('');

    const fowHTML = (fow) => fow.length === 0 ? '' : `
      <div style="background:#1e293b;border-radius:8px;padding:10px;margin-bottom:12px">
        <div style="color:#64748b;font-size:10px;font-weight:bold;letter-spacing:1px;margin-bottom:8px">FALL OF WICKETS</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px">
          ${fow.map(w => `
            <div style="background:#0f172a;border-radius:6px;padding:6px 10px;text-align:center">
              <div style="color:#ef4444;font-size:11px;font-weight:bold">${w.num}-W</div>
              <div style="color:#64748b;font-size:10px">Ov ${w.over}</div>
              <div style="color:#94a3b8;font-size:10px">${w.batsman}</div>
            </div>`).join('')}
        </div>
      </div>`;

    const inningsHTML = (title, score, overs, batting, bowling, extras, fow, isSecond) => `
      <div style="background:${isSecond ? '#1a3a2a' : '#1e3a5f'};border-radius:8px;padding:12px;margin-bottom:8px">
        <div style="color:#94a3b8;font-size:10px;font-weight:bold;letter-spacing:1px">${isSecond ? '2ND INNINGS' : '1ST INNINGS'}</div>
        <div style="color:#fff;font-size:18px;font-weight:bold;margin-top:2px">${title}</div>
        <div style="color:#38bdf8;font-size:28px;font-weight:bold">${score}</div>
        <div style="color:#94a3b8;font-size:12px">${overs} overs</div>
      </div>
      <div style="color:#64748b;font-size:10px;font-weight:bold;letter-spacing:1px;padding:8px 4px 4px">BATTING</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:8px">
        <tr style="background:#0f172a">
          <th style="padding:8px 10px;color:#64748b;font-size:11px;text-align:left">BATTER</th>
          <th style="padding:8px 6px;color:#64748b;font-size:11px;text-align:left">DISMISSAL</th>
          <th style="padding:8px 10px;color:#64748b;font-size:11px;text-align:center">R</th>
          <th style="padding:8px 10px;color:#64748b;font-size:11px;text-align:center">B</th>
          <th style="padding:8px 10px;color:#64748b;font-size:11px;text-align:center">4s</th>
          <th style="padding:8px 10px;color:#64748b;font-size:11px;text-align:center">6s</th>
          <th style="padding:8px 10px;color:#64748b;font-size:11px;text-align:center">SR</th>
        </tr>
        ${battingRowsHTML(batting)}
        <tr style="background:#0f172a">
          <td colspan="2" style="padding:8px 10px;color:#94a3b8">Extras</td>
          <td colspan="5" style="padding:8px 10px;color:#94a3b8;font-size:12px">
            ${extras?.total || 0} (w ${extras?.wide || 0}, nb ${extras?.noBall || 0}, b ${extras?.bye || 0})
          </td>
        </tr>
        <tr style="background:#162032">
          <td colspan="2" style="padding:10px;color:#fff;font-weight:bold">TOTAL</td>
          <td colspan="5" style="padding:10px;color:#38bdf8;font-weight:bold">${score} (${overs} Ov)</td>
        </tr>
      </table>
      ${fowHTML(fow)}
      <div style="color:#64748b;font-size:10px;font-weight:bold;letter-spacing:1px;padding:8px 4px 4px">BOWLING</div>
      <table style="width:100%;border-collapse:collapse;margin-bottom:16px">
        <tr style="background:#0f172a">
          <th style="padding:8px 10px;color:#64748b;font-size:11px;text-align:left">BOWLER</th>
          <th style="padding:8px 10px;color:#64748b;font-size:11px;text-align:center">O</th>
          <th style="padding:8px 10px;color:#64748b;font-size:11px;text-align:center">M</th>
          <th style="padding:8px 10px;color:#64748b;font-size:11px;text-align:center">R</th>
          <th style="padding:8px 10px;color:#64748b;font-size:11px;text-align:center">W</th>
          <th style="padding:8px 10px;color:#64748b;font-size:11px;text-align:center">Eco</th>
        </tr>
        ${bowlingRowsHTML(bowling)}
      </table>`;

    const result = matchResult;
    const resultBanner = result ? `
      <div style="background:${result.resultType === 'tie' ? '#1a2a3a' : '#1a3a1a'};border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;border:2px solid ${result.resultType === 'tie' ? '#38bdf8' : '#22c55e'}">
        <div style="color:${result.resultType === 'tie' ? '#38bdf8' : '#22c55e'};font-size:22px;font-weight:bold">
          ${result.resultType === 'tie' ? '🤝 MATCH TIED!' : `🏆 ${result.winner} WON!`}
        </div>
        ${result.resultType !== 'tie' ? `<div style="color:#94a3b8;font-size:14px;margin-top:4px">by ${result.margin}</div>` : ''}
        <div style="display:flex;justify-content:center;gap:40px;margin-top:12px">
          <div>
            <div style="color:#64748b;font-size:11px">1st Innings</div>
            <div style="color:#fff;font-weight:bold;font-size:18px">${result.firstScore}</div>
            <div style="color:#94a3b8;font-size:12px">${result.firstTeam}</div>
          </div>
          <div>
            <div style="color:#64748b;font-size:11px">2nd Innings</div>
            <div style="color:#fff;font-weight:bold;font-size:18px">${result.secondScore}</div>
            <div style="color:#94a3b8;font-size:12px">${result.secondTeam}</div>
          </div>
        </div>
      </div>` : '';

    const motmBanner = motm ? `
      <div style="background:#1a1a0a;border-radius:12px;padding:16px;margin-bottom:16px;text-align:center;border:2px solid #f59e0b">
        <div style="color:#f59e0b;font-size:12px;font-weight:bold;letter-spacing:1px">🌟 MAN OF THE MATCH</div>
        <div style="color:#fff;font-size:22px;font-weight:bold;margin-top:6px">${motm.name}</div>
        <div style="color:#94a3b8;font-size:13px;margin-top:4px">
          ${motm.runs > 0 ? `${motm.runs} runs (${motm.balls}b)` : ''}
          ${motm.runs > 0 && motm.wickets > 0 ? ' · ' : ''}
          ${motm.wickets > 0 ? `${motm.wickets} wickets` : ''}
        </div>
      </div>` : '';

    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8"/>
        <meta name="viewport" content="width=device-width,initial-scale=1"/>
        <style>
          body { background:#0f172a; color:#fff; font-family:Arial,sans-serif; padding:20px; margin:0; }
          * { box-sizing:border-box; }
          table { border-collapse:collapse; }
        </style>
      </head>
      <body>
        <!-- Header -->
        <div style="text-align:center;margin-bottom:20px;padding:16px;background:#1e293b;border-radius:12px">
          <div style="color:#38bdf8;font-size:24px;font-weight:bold">🏏 CricScore</div>
          <div style="color:#94a3b8;font-size:13px;margin-top:4px">Official Match Scorecard</div>
          ${match.venue ? `<div style="color:#64748b;font-size:12px;margin-top:4px">📍 ${match.venue}</div>` : ''}
          ${match.matchDate ? `<div style="color:#64748b;font-size:12px">📅 ${match.matchDate} ${match.matchTime || ''}</div>` : ''}
        </div>

        ${resultBanner}

        ${fi ? inningsHTML(fi.team, `${fi.runs}/${fi.wickets}`, getOvers(fi.balls), batting1, bowling1, extras1, fow1, false) : ''}
        ${inningsHTML(match.battingTeam, `${match.runs}/${match.wickets}`, getOvers(match.balls), batting2, bowling2, extras2, fow2, fi !== null)}

        ${motmBanner}

        <div style="text-align:center;color:#475569;font-size:11px;margin-top:16px">
          Generated by CricScore App · ${new Date().toLocaleDateString()}
        </div>
      </body>
      </html>`;

    try {
      const { uri } = await Print.printToFileAsync({ html, base64: false });
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'application/pdf',
          dialogTitle: 'Share Scorecard PDF',
          UTI: 'com.adobe.pdf',
        });
      } else {
        Alert.alert('PDF Created', 'PDF saved but sharing not available on this device.');
      }
    } catch (e) {
      Alert.alert('Error', 'Could not generate PDF: ' + e.message);
    }
    setPdfLoading(false);
  };

  // ── Innings section ──
  const InningsCard = ({ title, score, overs, batting, bowling, extras, fow, isSecond }) => (
    <>
      <View style={[styles.inningsHeader, isSecond && { backgroundColor: '#1a3a2a' }]}>
        <Text style={styles.inningsLabel}>{isSecond ? '2nd Innings' : '1st Innings'}</Text>
        <Text style={styles.inningsTeam}>{title}</Text>
        <Text style={styles.inningsScore}>{score}</Text>
        <Text style={styles.inningsOvers}>({overs} ov)</Text>
      </View>

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
        {batting.map((b, i) => (
          <View key={i} style={[styles.row, i % 2 === 0 && styles.rowAlt]}>
            <View style={[styles.col, styles.colBig]}>
              <Text style={[styles.playerName, b.dismissal === 'batting *' && { color: '#38bdf8' }]}>
                {b.name}{b.dismissal === 'batting *' ? ' *' : ''}
              </Text>
              <Text style={styles.dismissalText}>{b.dismissal}</Text>
            </View>
            <Text style={[styles.colVal, styles.colMid, b.runs >= 50 && { color: '#f59e0b', fontWeight: 'bold' }]}>{b.runs}</Text>
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
              parseFloat(b.eco) <= 10 ? { color: '#f59e0b' } : { color: '#ef4444' }]}>{b.eco}</Text>
          </View>
        ))}
      </View>
    </>
  );

  return (
    <ScrollView style={styles.container}>

      {/* Share modal */}
      <Modal visible={showShareModal} transparent animationType="slide">
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Share Scorecard</Text>

            <TouchableOpacity style={[styles.shareOption, { borderColor: '#22c55e' }]} onPress={shareShortSummary}>
              <Text style={styles.shareIcon}>📱</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareTitle}>Short Summary</Text>
                <Text style={styles.shareSub}>Quick WhatsApp / social media share with match result and top performers</Text>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={[styles.shareOption, { borderColor: '#38bdf8', marginTop: 10 }]} onPress={generatePDF}>
              <Text style={styles.shareIcon}>📄</Text>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareTitle}>Full PDF Scorecard</Text>
                <Text style={styles.shareSub}>Professional scorecard with both innings, batting, bowling, FOW and Man of the Match</Text>
              </View>
              {pdfLoading && <ActivityIndicator color="#38bdf8" />}
            </TouchableOpacity>

            <TouchableOpacity style={styles.btnClose} onPress={() => setShowShareModal(false)}>
              <Text style={styles.btnCloseText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Match Header */}
      <View style={styles.header}>
        {computedResult && (
          <View style={[styles.resultBanner, {
            backgroundColor: computedResult.resultType === 'tie' ? '#1a2a3a' : '#1a3a1a',
            borderWidth: 1.5,
            borderColor: computedResult.resultType === 'tie' ? '#38bdf8' : '#22c55e',
          }]}>
            <Text style={[styles.resultText, { fontSize: 20 }]}>
              {computedResult.resultType === 'tie' ? '🤝 Match Tied!' : `🏆 ${computedResult.winner} Won!`}
            </Text>
            {computedResult.resultType !== 'tie' && (
              <Text style={[styles.resultMargin, { fontSize: 15, color: '#fff', marginTop: 4 }]}>
                by {computedResult.margin}
              </Text>
            )}
            <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
              <Text style={{ color: '#64748b', fontSize: 12 }}>
                {computedResult.firstTeam}: {computedResult.firstScore}
              </Text>
              <Text style={{ color: '#64748b', fontSize: 12 }}>
                {computedResult.secondTeam}: {computedResult.secondScore}
              </Text>
            </View>
            {computedResult.motm && computedResult.motm !== '—' && (
              <Text style={{ color: '#f59e0b', fontSize: 12, marginTop: 6 }}>
                🌟 MOTM: {matchResult.motm}
                {matchResult.motmRuns > 0 ? ` — ${matchResult.motmRuns} runs` : ''}
                {matchResult.motmWickets > 0 ? ` · ${matchResult.motmWickets} wkts` : ''}
              </Text>
            )}
          </View>
        )}
        <Text style={styles.teamName}>{match.battingTeam}</Text>
        <Text style={styles.bigScore}>{match.runs}/{match.wickets}</Text>
        <Text style={styles.oversText}>({getOvers(match.balls)} ov) · RR: {runRate}</Text>
        {fi && <Text style={styles.firstInningsRef}>1st Inn: {fi.team} {fi.runs}/{fi.wickets}</Text>}
        {match.venue ? <Text style={styles.metaText}>📍 {match.venue}</Text> : null}
        {match.matchDate ? <Text style={styles.metaText}>📅 {match.matchDate} {match.matchTime}</Text> : null}
      </View>

      {fi && <InningsCard title={fi.team} score={`${fi.runs}/${fi.wickets}`} overs={getOvers(fi.balls)} batting={batting1} bowling={bowling1} extras={extras1} fow={fow1} isSecond={false} />}
      <InningsCard title={match.battingTeam} score={`${match.runs}/${match.wickets}`} overs={getOvers(match.balls)} batting={batting2} bowling={bowling2} extras={extras2} fow={fow2} isSecond={fi !== null} />

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

      {/* Share button */}
      <TouchableOpacity style={styles.shareBtn} onPress={() => setShowShareModal(true)}>
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
  resultBanner: { backgroundColor: '#0f172a', borderRadius: 10, padding: 10, marginBottom: 10, alignItems: 'center', width: '100%' },
  resultText: { color: '#22c55e', fontSize: 18, fontWeight: 'bold' },
  resultMargin: { color: '#94a3b8', fontSize: 13, marginTop: 2 },
  teamName: { color: '#93c5fd', fontSize: 13, fontWeight: '600', textTransform: 'uppercase', letterSpacing: 1 },
  bigScore: { color: '#fff', fontSize: 52, fontWeight: 'bold', lineHeight: 60 },
  oversText: { color: '#93c5fd', fontSize: 14, marginBottom: 4 },
  firstInningsRef: { color: '#f59e0b', fontSize: 13, fontWeight: '600', marginBottom: 4 },
  metaText: { color: '#475569', fontSize: 12, marginTop: 2 },

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

  fowWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, padding: 10 },
  fowChip: { backgroundColor: '#0f172a', borderRadius: 8, padding: 8, minWidth: 70, alignItems: 'center' },
  fowScore: { color: '#ef4444', fontSize: 12, fontWeight: 'bold' },
  fowOver: { color: '#64748b', fontSize: 10, marginTop: 2 },
  fowName: { color: '#94a3b8', fontSize: 11, marginTop: 2 },

  shareBtn: { backgroundColor: '#22c55e', margin: 14, padding: 15, borderRadius: 12, alignItems: 'center' },
  shareBtnText: { color: '#0f172a', fontWeight: 'bold', fontSize: 15 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.8)', justifyContent: 'flex-end' },
  modalCard: { backgroundColor: '#1e293b', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20 },
  modalTitle: { color: '#fff', fontWeight: 'bold', fontSize: 18, marginBottom: 16, textAlign: 'center' },
  shareOption: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: '#0f172a', borderRadius: 12, padding: 14, borderWidth: 1 },
  shareIcon: { fontSize: 28 },
  shareTitle: { color: '#fff', fontWeight: 'bold', fontSize: 14, marginBottom: 4 },
  shareSub: { color: '#64748b', fontSize: 12, lineHeight: 18 },
  btnClose: { backgroundColor: '#334155', padding: 14, borderRadius: 12, alignItems: 'center', marginTop: 12 },
  btnCloseText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});