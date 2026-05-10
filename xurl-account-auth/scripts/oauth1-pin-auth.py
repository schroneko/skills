#!/usr/bin/env python3
import base64
import hashlib
import hmac
import os
import secrets
import subprocess
import sys
import time
import urllib.parse
import urllib.request

import yaml


def abort(message):
    raise SystemExit(message)


if len(sys.argv) != 3:
    abort("usage: uv run --with pyyaml python scripts/oauth1-pin-auth.py APP_NAME TARGET_USERNAME")

app_name = sys.argv[1]
target_username = sys.argv[2]
config_path = os.path.expanduser("~/.xurl")

with open(config_path, "r", encoding="utf-8") as file:
    config = yaml.safe_load(file)

app = config.get("apps", {}).get(app_name)
if not app:
    abort(f"app not found: {app_name}")

consumer_key = app.get("consumer_key") or app.get("client_id")
consumer_secret = app.get("consumer_secret") or app.get("client_secret")
if not consumer_key:
    abort(f"consumer key missing for app: {app_name}")
if not consumer_secret:
    abort(f"consumer secret missing for app: {app_name}")


def encode(value):
    return urllib.parse.quote(str(value), safe="~")


def oauth_header(method, url, params, token_secret=""):
    parameter_string = "&".join(f"{encode(key)}={encode(value)}" for key, value in sorted(params.items()))
    signature_base = "&".join([method.upper(), encode(url), encode(parameter_string)])
    signing_key = f"{encode(consumer_secret)}&{encode(token_secret)}"
    digest = hmac.new(signing_key.encode(), signature_base.encode(), hashlib.sha1).digest()
    signature = base64.b64encode(digest).decode()
    header_params = dict(params)
    header_params["oauth_signature"] = signature
    return "OAuth " + ", ".join(f'{encode(key)}="{encode(value)}"' for key, value in sorted(header_params.items()))


def post_form(url, oauth_params, token_secret=""):
    request = urllib.request.Request(url, method="POST")
    request.add_header("Authorization", oauth_header("POST", url, oauth_params, token_secret))
    with urllib.request.urlopen(request) as response:
        return response.read().decode()


request_token_url = "https://api.twitter.com/oauth/request_token"
request_params = {
    "oauth_callback": "oob",
    "oauth_consumer_key": consumer_key,
    "oauth_nonce": secrets.token_hex(16),
    "oauth_signature_method": "HMAC-SHA1",
    "oauth_timestamp": str(int(time.time())),
    "oauth_version": "1.0",
}

request_body = post_form(request_token_url, request_params)
request_data = dict(urllib.parse.parse_qsl(request_body))
oauth_token = request_data["oauth_token"]
oauth_token_secret = request_data["oauth_token_secret"]

subprocess.run(
    ["open", f"https://api.twitter.com/oauth/authorize?oauth_token={encode(oauth_token)}"],
    check=False,
)

pin = input("PIN: ").strip()
if not pin:
    abort("PIN missing")

access_token_url = "https://api.twitter.com/oauth/access_token"
access_params = {
    "oauth_consumer_key": consumer_key,
    "oauth_nonce": secrets.token_hex(16),
    "oauth_signature_method": "HMAC-SHA1",
    "oauth_timestamp": str(int(time.time())),
    "oauth_token": oauth_token,
    "oauth_verifier": pin,
    "oauth_version": "1.0",
}

access_body = post_form(access_token_url, access_params, oauth_token_secret)
access_data = dict(urllib.parse.parse_qsl(access_body))
authorized_username = access_data.get("screen_name")
if authorized_username != target_username:
    abort(f"authorized user is {authorized_username}, expected {target_username}")

app["consumer_key"] = consumer_key
app["consumer_secret"] = consumer_secret
app["oauth1_token"] = {
    "type": "oauth1",
    "oauth1": {
        "access_token": access_data["oauth_token"],
        "token_secret": access_data["oauth_token_secret"],
        "consumer_key": consumer_key,
        "consumer_secret": consumer_secret,
    },
}
config["default_app"] = app_name

with open(config_path, "w", encoding="utf-8") as file:
    yaml.safe_dump(config, file, allow_unicode=True, sort_keys=False)
os.chmod(config_path, 0o600)

print(f"saved oauth1 token for {authorized_username}")
