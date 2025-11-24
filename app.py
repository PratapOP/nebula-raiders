from flask import Flask, render_template, request, jsonify
import os

# try to import redis; if not available, we'll run without leaderboard
try:
    import redis
except Exception as e:
    redis = None

app = Flask(__name__, static_folder="static", template_folder="templates")

# Initialize Redis connection only if REDIS_URL is provided and redis library exists.
REDIS_URL = os.environ.get("REDIS_URL")
if redis is not None and REDIS_URL:
    try:
        r = redis.from_url(REDIS_URL)
        print("✅ Connected to Redis.")
    except Exception as e:
        print("⚠️ Redis connection failed:", e)
        r = None
else:
    r = None
    if not REDIS_URL:
        print("⚠️ REDIS_URL not set — running in local mode without leaderboard.")
    else:
        print("⚠️ redis python library is not available — install redis to enable leaderboard.")


@app.route("/")
def index():
    return render_template("index.html")


@app.route("/save-score", methods=["POST"])
def save_score():
    """
    Save a score to Redis sorted set 'leaderboard'.
    If Redis not available, return status indicating disabled.
    """
    if r is None:
        return jsonify({"status": "no-redis", "message": "Leaderboard not enabled on this instance."}), 200

    data = request.get_json(force=True) or {}
    name = data.get("name", "Player")
    try:
        score = int(data.get("score", 0))
    except Exception:
        score = 0

    try:
        # use ZADD to add player name with score (score as score)
        r.zadd("leaderboard", {name: score})
        return jsonify({"status": "saved"}), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


@app.route("/get-highscores")
def get_highscores():
    """
    Return top 10 highscores from Redis 'leaderboard' sorted set.
    If Redis not available, return empty list.
    """
    if r is None:
        return jsonify([]), 200

    try:
        result = r.zrevrange("leaderboard", 0, 9, withscores=True)
        final = [{"name": name.decode() if isinstance(name, bytes) else name, "score": int(score)} for name, score in result]
        return jsonify(final), 200
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)
