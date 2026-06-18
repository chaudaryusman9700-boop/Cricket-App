from flask import Flask, request, jsonify
from flask_cors import CORS
import numpy as np
import joblib
import os

app = Flask(__name__)
CORS(app)

# ── Load models ───────────────────────────────────────────────────
bat_model = bat_le = bowl_model = bowl_le = None

def load_models():
    global bat_model, bat_le, bowl_model, bowl_le
    try:
        bat_model  = joblib.load('models/batting_model.pkl')
        bat_le     = joblib.load('models/batting_le.pkl')
        bowl_model = joblib.load('models/bowling_model.pkl')
        bowl_le    = joblib.load('models/bowling_le.pkl')
        print("✅ Models loaded")
    except Exception as e:
        print(f"⚠️  Models not found: {e} — run train_model.py first")

load_models()

# ── Tip messages ──────────────────────────────────────────────────
BATTING_TIPS = {
    'attack': {
        'title': '⚡ Go Aggressive!',
        'tips': [
            'Target the gaps — hit through cover and mid-wicket',
            'Look to play over the infield on full deliveries',
            'Use your feet against spinners — come down the track',
            'Ramp and scoop options available on short deliveries',
        ]
    },
    'rotate_strike': {
        'title': '🔄 Rotate the Strike',
        'tips': [
            'Work the ball into gaps for singles and twos',
            'Use soft hands for deflections behind square',
            'Push to long-on and long-off for easy singles',
            'Communicate well with your partner between wickets',
        ]
    },
    'consolidate': {
        'title': '🛡️ Consolidate Your Position',
        'tips': [
            'Play straight — avoid risky cross-bat shots',
            'Let the bad balls come to you — be patient',
            'Build a partnership before accelerating',
            'Watch the ball carefully — play late',
        ]
    }
}

BOWLING_TIPS = {
    'bowl_fuller': {
        'title': '📍 Bowl Fuller Length',
        'tips': [
            'Pitch it up — fuller length restricts scoring',
            'Target the yorker on off-stump line',
            'Avoid short balls — batsman is scoring off them',
            'Use swing or seam movement with full length',
        ]
    },
    'vary_pace': {
        'title': '🎯 Vary Your Pace',
        'tips': [
            'Mix up slow balls with your stock delivery',
            'Change your release — use a knuckle ball or off-cutter',
            'Set up the batsman with 2 fast balls then a slower one',
            'Use change of angle — bowl from wide of the crease',
        ]
    },
    'change_line': {
        'title': '↔️ Change Your Line',
        'tips': [
            'Move the ball into the batsman — bowl at the stumps',
            'Try around the wicket to create different angles',
            'Bowl wide outside off to invite the drive then cut back',
            'Discuss field changes with your captain',
        ]
    },
    'maintain_pressure': {
        'title': '💪 Maintain the Pressure',
        'tips': [
            'Keep bowling in the same channel — you are in control',
            'Attack the stumps — the batsman is under pressure',
            'Use attacking field placements — slip or short leg',
            'Keep running in hard — your rhythm is good right now',
        ]
    }
}

# ── Helper: build features from match data ────────────────────────
def build_batting_features(data):
    ball_history = data.get('ballHistory', [])
    striker = data.get('striker', '')
    batsmen_stats = data.get('batsmenStats', {})
    over_num = data.get('overNum', 0)
    wickets_down = data.get('wickets', 0)
    runs_needed = data.get('runsNeeded', 0)
    balls_left = data.get('ballsLeft', 60)
    total_balls = data.get('totalBalls', 60)

    stat = batsmen_stats.get(striker, {'runs': 0, 'balls': 0})
    runs = stat.get('runs', 0)
    balls = stat.get('balls', 1)

    striker_balls = [b for b in ball_history if b.get('striker') == striker]
    dots = sum(1 for b in striker_balls if b.get('type') == 'dot' or
               (b.get('type') == 'run' and b.get('run', 0) == 0))
    boundaries = sum(1 for b in striker_balls if b.get('run', 0) in [4, 6])

    strike_rate  = (runs / balls * 100) if balls > 0 else 0
    dot_pct      = dots / len(striker_balls) if striker_balls else 0.5
    boundary_pct = boundaries / len(striker_balls) if striker_balls else 0.1
    rrr = runs_needed / (balls_left / 6) if balls_left > 0 else 0

    return [strike_rate, dot_pct, boundary_pct, balls, runs,
            over_num, wickets_down, rrr, balls_left]

def build_bowling_features(data):
    ball_history = data.get('ballHistory', [])
    bowler = data.get('bowler', '')
    bowler_stats = data.get('bowlerStats', {})
    over_num = data.get('overNum', 0)

    stat = bowler_stats.get(bowler, {'runs': 0, 'balls': 0, 'wickets': 0})
    runs_given  = stat.get('runs', 0)
    balls_bowled = stat.get('balls', 1)
    wickets     = stat.get('wickets', 0)

    bowler_balls = [b for b in ball_history if b.get('bowler') == bowler]
    dots  = sum(1 for b in bowler_balls if b.get('type') == 'dot')
    wides = sum(1 for b in bowler_balls if b.get('type') in ['wide', 'wideRun', 'wideBoundary'])

    economy  = (runs_given / (balls_bowled / 6)) if balls_bowled > 0 else 0
    dot_pct  = dots / len(bowler_balls) if bowler_balls else 0.3
    wide_pct = wides / len(bowler_balls) if bowler_balls else 0.1

    return [economy, wickets, dot_pct, wide_pct, over_num, balls_bowled, runs_given]

# ── Routes ────────────────────────────────────────────────────────
@app.route('/', methods=['GET'])
def home():
    return jsonify({
        'status': 'ok',
        'message': 'Cricket AI Coaching API ✅',
        'models_loaded': bat_model is not None,
        'endpoints': {
            'batting': '/coach/batting',
            'bowling': '/coach/bowling',
            'full':    '/coach/full',
        }
    })

@app.route('/coach/batting', methods=['POST'])
def batting_coach():
    try:
        data = request.json or {}
        if bat_model is None:
            return jsonify({'error': 'Models not loaded. Run train_model.py first.'}), 503

        features = build_batting_features(data)
        X = np.array(features).reshape(1, -1)
        pred = bat_model.predict(X)[0]
        tip_key = bat_le.inverse_transform([pred])[0]
        tip_data = BATTING_TIPS.get(tip_key, BATTING_TIPS['consolidate'])

        # Pick one specific tip based on situation
        import random
        specific_tip = random.choice(tip_data['tips'])

        striker = data.get('striker', 'Batsman')
        stat = data.get('batsmenStats', {}).get(striker, {'runs': 0, 'balls': 0})
        sr = (stat['runs'] / stat['balls'] * 100) if stat.get('balls', 0) > 0 else 0

        return jsonify({
            'player': striker,
            'category': tip_key,
            'title': tip_data['title'],
            'tip': specific_tip,
            'all_tips': tip_data['tips'],
            'stats': {
                'runs': stat.get('runs', 0),
                'balls': stat.get('balls', 0),
                'strike_rate': round(sr, 1),
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/coach/bowling', methods=['POST'])
def bowling_coach():
    try:
        data = request.json or {}
        if bowl_model is None:
            return jsonify({'error': 'Models not loaded. Run train_model.py first.'}), 503

        features = build_bowling_features(data)
        X = np.array(features).reshape(1, -1)
        pred = bowl_model.predict(X)[0]
        tip_key = bowl_le.inverse_transform([pred])[0]
        tip_data = BOWLING_TIPS.get(tip_key, BOWLING_TIPS['vary_pace'])

        import random
        specific_tip = random.choice(tip_data['tips'])

        bowler = data.get('bowler', 'Bowler')
        stat = data.get('bowlerStats', {}).get(bowler, {'runs': 0, 'balls': 0, 'wickets': 0})
        eco = (stat['runs'] / (stat['balls'] / 6)) if stat.get('balls', 0) > 0 else 0

        return jsonify({
            'player': bowler,
            'category': tip_key,
            'title': tip_data['title'],
            'tip': specific_tip,
            'all_tips': tip_data['tips'],
            'stats': {
                'runs_given': stat.get('runs', 0),
                'balls': stat.get('balls', 0),
                'wickets': stat.get('wickets', 0),
                'economy': round(eco, 1),
            }
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/coach/full', methods=['POST'])
def full_coach():
    """Returns both batting and bowling tips in one call.
    Accepts either a flat payload (used for both) or
    { batting: {...}, bowling: {...} } for separate feature sets.
    """
    try:
        data = request.json or {}
        batting_data = data.get('batting', data)
        bowling_data = data.get('bowling', data)

        import json
        bat_resp = app.test_client().post('/coach/batting',
            json=batting_data, content_type='application/json')
        bowl_resp = app.test_client().post('/coach/bowling',
            json=bowling_data, content_type='application/json')

        return jsonify({
            'batting': json.loads(bat_resp.data),
            'bowling': json.loads(bowl_resp.data),
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port, debug=False)