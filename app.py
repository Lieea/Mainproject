from flask import Flask, render_template, request, redirect, url_for, session
import sqlite3

app = Flask(__name__)
app.secret_key = "secretkey123"

# Database connection
def get_db():
    return sqlite3.connect("users.db")

# Create table
with get_db() as db:
    db.execute("""
        CREATE TABLE IF NOT EXISTS users(
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE,
            password TEXT
        )
    """)

def ensure_user_columns():
    """Ensure optional vehicle columns exist in the users table."""
    with get_db() as db:
        cur = db.execute("PRAGMA table_info(users)")
        cols = [r[1] for r in cur.fetchall()]
        if 'vehicle_number' not in cols:
            try:
                db.execute("ALTER TABLE users ADD COLUMN vehicle_number TEXT")
            except Exception:
                pass
        if 'vehicle_model' not in cols:
            try:
                db.execute("ALTER TABLE users ADD COLUMN vehicle_model TEXT")
            except Exception:
                pass
        if 'air_fuel_ratio' not in cols:
            try:
                db.execute("ALTER TABLE users ADD COLUMN air_fuel_ratio TEXT")
            except Exception:
                pass

ensure_user_columns()

@app.route("/")
def home():
    return redirect(url_for("login"))

@app.route("/signup", methods=["GET", "POST"])
def signup():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]
        vehicle_number = request.form.get('vehicle_number', '')
        vehicle_model = request.form.get('vehicle_model', '')
        air_fuel_ratio = request.form.get('air_fuel_ratio', '')
        # server-side validation: vehicle_number and vehicle_model are mandatory
        if not vehicle_number or not vehicle_model:
            return render_template('signup.html', error='Vehicle number and model are required')

        try:
            with get_db() as db:
                db.execute("INSERT INTO users(username, password, vehicle_number, vehicle_model, air_fuel_ratio) VALUES (?,?,?,?,?)",
                           (username, password, vehicle_number, vehicle_model, air_fuel_ratio))
            return redirect(url_for("login"))
        except Exception:
            return render_template('signup.html', error='User already exists')

    return render_template("signup.html")

@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        username = request.form["username"]
        password = request.form["password"]

        db = get_db()
        user = db.execute(
            "SELECT username, vehicle_number, vehicle_model, air_fuel_ratio FROM users WHERE username=? AND password=?",
            (username, password)
        ).fetchone()

        if user:
            session["user"] = user[0]
            # vehicle info may be blank
            session['vehicle_number'] = user[1] or ''
            session['vehicle_model'] = user[2] or ''
            session['air_fuel_ratio'] = user[3] or ''

            # If optional vehicle fields were provided on login (e.g., AFR or updated details), save them
            vehicle_number = request.form.get('vehicle_number')
            vehicle_model = request.form.get('vehicle_model')
            air_fuel_ratio = request.form.get('air_fuel_ratio')
            # Only update DB if any provided and non-empty
            if (vehicle_number and vehicle_number.strip()) or (vehicle_model and vehicle_model.strip()) or (air_fuel_ratio and air_fuel_ratio.strip()):
                # build values using existing session values as fallback
                vn = vehicle_number.strip() if vehicle_number and vehicle_number.strip() else session.get('vehicle_number','')
                vm = vehicle_model.strip() if vehicle_model and vehicle_model.strip() else session.get('vehicle_model','')
                afr = air_fuel_ratio.strip() if air_fuel_ratio and air_fuel_ratio.strip() else session.get('air_fuel_ratio','')
                db.execute("UPDATE users SET vehicle_number=?, vehicle_model=?, air_fuel_ratio=? WHERE username=?",
                           (vn, vm, afr, user[0]))
                # update session with new values
                session['vehicle_number'] = vn
                session['vehicle_model'] = vm
                session['air_fuel_ratio'] = afr

            return redirect(url_for("dashboard"))
        else:
            return "Invalid credentials"

    return render_template("login.html")

@app.route("/dashboard")
def dashboard():
    if "user" not in session:
        return redirect(url_for("login"))

    # Example pollution value (0–100)
    pollution_value = 68   # you can replace with real data later
    # include user/vehicle info from session if available
    profile = {
        'username': session.get('user',''),
        'vehicle_number': session.get('vehicle_number',''),
        'vehicle_model': session.get('vehicle_model',''),
        'air_fuel_ratio': session.get('air_fuel_ratio','')
    }
    return render_template("dashboard.html", pollution=pollution_value, profile=profile)


@app.route('/profile', methods=['GET', 'POST'])
def profile():
    if 'user' not in session:
        return redirect(url_for('login'))

    username = session['user']
    if request.method == 'POST':
        vehicle_number = request.form.get('vehicle_number', '')
        vehicle_model = request.form.get('vehicle_model', '')
        air_fuel_ratio = request.form.get('air_fuel_ratio', '')
        # server-side validation: vehicle_number and vehicle_model are mandatory
        if not vehicle_number or not vehicle_model:
            values = {'vehicle_number': vehicle_number, 'vehicle_model': vehicle_model, 'air_fuel_ratio': air_fuel_ratio}
            return render_template('profile.html', profile=values, error='Vehicle number and model are required')

        with get_db() as db:
            db.execute("UPDATE users SET vehicle_number=?, vehicle_model=?, air_fuel_ratio=? WHERE username=?",
                       (vehicle_number, vehicle_model, air_fuel_ratio, username))
        # update session
        session['vehicle_number'] = vehicle_number
        session['vehicle_model'] = vehicle_model
        session['air_fuel_ratio'] = air_fuel_ratio
        return redirect(url_for('dashboard'))

    # GET: fetch current values to prefill
    db = get_db()
    row = db.execute("SELECT vehicle_number, vehicle_model, air_fuel_ratio FROM users WHERE username=?", (username,)).fetchone()
    db.close()
    values = {'vehicle_number':'', 'vehicle_model':'', 'air_fuel_ratio':''}
    if row:
        values['vehicle_number'] = row[0] or ''
        values['vehicle_model'] = row[1] or ''
        values['air_fuel_ratio'] = row[2] or ''
    return render_template('profile.html', profile=values)


@app.route('/stats')
def stats():
    if "user" not in session:
        return redirect(url_for("login"))

    # Generate deterministic demo values per date (replace with real DB queries later)
    from datetime import date, timedelta
    import calendar

    def value_for_date(d: date) -> int:
        # simple deterministic formula to produce 0-100-ish demo values
        return 40 + ((d.day * 3 + d.month * 2 + d.year) % 61)

    today = date.today()

    # Week: last 7 days (oldest -> newest)
    week_dates = [today - timedelta(days=6 - i) for i in range(7)]
    week_values = [value_for_date(d) for d in week_dates]
    week_labels = [d.strftime('%a %d') for d in week_dates]
    week_avg = round(sum(week_values) / len(week_values)) if week_values else 0

    # Month: create 4 week-buckets corresponding to the calendar month
    month_len = calendar.monthrange(today.year, today.month)[1]
    buckets = [(1, 7), (8, 14), (15, 21), (22, month_len)]
    month_groups = []
    month_ranges = []
    for start, end in buckets:
        # base date for the bucket's anchor day
        try:
            anchor = date(today.year, today.month, start)
        except Exception:
            month_groups.append(0)
            month_ranges.append((None, None))
            continue
        # align to calendar week (Monday..Sunday) that contains the anchor
        week_start = anchor - timedelta(days=anchor.weekday())
        week_end = week_start + timedelta(days=6)
        # clamp to today: do not include future days
        actual_end = min(week_end, today)
        if actual_end < week_start:
            month_groups.append(0)
            month_ranges.append((week_start.isoformat(), week_end.isoformat()))
            continue
        # collect values across the week range (may cross month/year boundaries)
        cur = week_start
        vals = []
        while cur <= actual_end:
            vals.append(value_for_date(cur))
            cur += timedelta(days=1)
        avg = round(sum(vals) / len(vals)) if vals else 0
        month_groups.append(avg)
        month_ranges.append((week_start.isoformat(), week_end.isoformat()))

    # compute month-level avg across non-empty groups
    valid = [v for v in month_groups if v > 0]
    month_avg = round(sum(valid) / len(valid)) if valid else 0

    return render_template('stats.html',
                           week=week_values,
                           week_labels=week_labels,
                           week_avg=week_avg,
                           month_groups=month_groups,
                           month_ranges=month_ranges,
                           month_avg=month_avg)

@app.route("/logout")
def logout():
    session.pop("user", None)
    return redirect(url_for("login"))

if __name__ == "__main__":
    app.run(debug=True)
