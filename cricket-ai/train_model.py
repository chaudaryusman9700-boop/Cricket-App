"""
Cricket AI Coaching Model Trainer
Run this once to train and save the models:
  python train_model.py
"""
import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.preprocessing import LabelEncoder
import joblib
import os

# ── Generate synthetic training data ──────────────────────────────
np.random.seed(42)
n = 2000

def generate_batting_data(n):
    data = []
    for _ in range(n):
        strike_rate = np.random.uniform(40, 250)
        dot_pct = np.random.uniform(0, 0.8)
        boundary_pct = np.random.uniform(0, 0.5)
        balls_faced = np.random.randint(1, 60)
        runs = int(balls_faced * strike_rate / 100)
        over_num = np.random.randint(0, 20)
        wickets_down = np.random.randint(0, 8)
        runs_needed = np.random.randint(0, 150)
        balls_left = np.random.randint(1, 120)
        rrr = runs_needed / (balls_left / 6) if balls_left > 0 else 0

        # Rule-based label generation
        if rrr > 15 or (over_num >= 15 and strike_rate < 100):
            tip = 'attack'
        elif wickets_down >= 6 or (runs_needed < 20 and balls_left > 30):
            tip = 'consolidate'
        elif dot_pct > 0.6 and strike_rate < 80:
            tip = 'rotate_strike'
        elif boundary_pct > 0.3 and wickets_down < 3:
            tip = 'attack'
        elif strike_rate < 70 and over_num < 10:
            tip = 'rotate_strike'
        else:
            tip = 'consolidate'

        data.append([strike_rate, dot_pct, boundary_pct, balls_faced,
                     runs, over_num, wickets_down, rrr, balls_left, tip])

    df = pd.DataFrame(data, columns=[
        'strike_rate', 'dot_pct', 'boundary_pct', 'balls_faced',
        'runs', 'over_num', 'wickets_down', 'rrr', 'balls_left', 'tip'
    ])
    return df

def generate_bowling_data(n):
    data = []
    for _ in range(n):
        economy = np.random.uniform(2, 20)
        wickets = np.random.randint(0, 6)
        dot_pct = np.random.uniform(0, 0.7)
        wide_pct = np.random.uniform(0, 0.3)
        over_num = np.random.randint(0, 20)
        balls_bowled = np.random.randint(6, 60)
        runs_given = int(balls_bowled * economy / 6)

        # Rule-based label
        if economy > 12 and wide_pct > 0.2:
            tip = 'bowl_fuller'
        elif economy > 10 and dot_pct < 0.3:
            tip = 'vary_pace'
        elif wickets == 0 and balls_bowled > 18:
            tip = 'change_line'
        elif dot_pct > 0.5 and wickets >= 2:
            tip = 'maintain_pressure'
        elif economy < 6 and dot_pct > 0.4:
            tip = 'maintain_pressure'
        else:
            tip = 'vary_pace'

        data.append([economy, wickets, dot_pct, wide_pct,
                     over_num, balls_bowled, runs_given, tip])

    df = pd.DataFrame(data, columns=[
        'economy', 'wickets', 'dot_pct', 'wide_pct',
        'over_num', 'balls_bowled', 'runs_given', 'tip'
    ])
    return df

# ── Train batting model ────────────────────────────────────────────
print("Training batting model...")
bat_df = generate_batting_data(n)
bat_le = LabelEncoder()
bat_df['tip_encoded'] = bat_le.fit_transform(bat_df['tip'])

bat_features = ['strike_rate', 'dot_pct', 'boundary_pct', 'balls_faced',
                'runs', 'over_num', 'wickets_down', 'rrr', 'balls_left']
X_bat = bat_df[bat_features]
y_bat = bat_df['tip_encoded']

bat_model = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=8)
bat_model.fit(X_bat, y_bat)
print(f"Batting model accuracy: {bat_model.score(X_bat, y_bat):.2f}")

# ── Train bowling model ────────────────────────────────────────────
print("Training bowling model...")
bowl_df = generate_bowling_data(n)
bowl_le = LabelEncoder()
bowl_df['tip_encoded'] = bowl_le.fit_transform(bowl_df['tip'])

bowl_features = ['economy', 'wickets', 'dot_pct', 'wide_pct',
                 'over_num', 'balls_bowled', 'runs_given']
X_bowl = bowl_df[bowl_features]
y_bowl = bowl_df['tip_encoded']

bowl_model = RandomForestClassifier(n_estimators=100, random_state=42, max_depth=8)
bowl_model.fit(X_bowl, y_bowl)
print(f"Bowling model accuracy: {bowl_model.score(X_bowl, y_bowl):.2f}")

# ── Save models ───────────────────────────────────────────────────
os.makedirs('models', exist_ok=True)
joblib.dump(bat_model, 'models/batting_model.pkl')
joblib.dump(bat_le, 'models/batting_le.pkl')
joblib.dump(bowl_model, 'models/bowling_model.pkl')
joblib.dump(bowl_le, 'models/bowling_le.pkl')
print("✅ Models saved to models/")