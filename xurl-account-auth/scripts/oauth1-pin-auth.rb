require "base64"
require "cgi"
require "net/http"
require "openssl"
require "securerandom"
require "uri"
require "yaml"

app_name = ARGV[0] || abort("usage: ruby scripts/oauth1-pin-auth.rb APP_NAME TARGET_USERNAME")
target_username = ARGV[1] || abort("usage: ruby scripts/oauth1-pin-auth.rb APP_NAME TARGET_USERNAME")

config_path = File.expand_path("~/.xurl")
config = YAML.load_file(config_path)
app = config.dig("apps", app_name)
abort "app not found: #{app_name}" unless app

consumer_key = app["consumer_key"] || app["client_id"]
consumer_secret = app["consumer_secret"] || app["client_secret"]
abort "consumer key missing for app: #{app_name}" if consumer_key.to_s.empty?
abort "consumer secret missing for app: #{app_name}" if consumer_secret.to_s.empty?

def encode(value)
  CGI.escape(value.to_s).gsub("+", "%20").gsub("%7E", "~")
end

def oauth_header(method, url, params, consumer_secret, token_secret = "")
  parameter_string = params.sort.map { |key, value| "#{encode(key)}=#{encode(value)}" }.join("&")
  signature_base = [method.upcase, encode(url), encode(parameter_string)].join("&")
  signing_key = "#{encode(consumer_secret)}&#{encode(token_secret)}"
  signature = Base64.strict_encode64(OpenSSL::HMAC.digest("sha1", signing_key, signature_base))
  header_params = params.merge("oauth_signature" => signature)
  "OAuth " + header_params.sort.map { |key, value| "#{encode(key)}=\"#{encode(value)}\"" }.join(", ")
end

request_token_url = "https://api.twitter.com/oauth/request_token"
request_params = {
  "oauth_callback" => "oob",
  "oauth_consumer_key" => consumer_key,
  "oauth_nonce" => SecureRandom.hex(16),
  "oauth_signature_method" => "HMAC-SHA1",
  "oauth_timestamp" => Time.now.to_i.to_s,
  "oauth_version" => "1.0"
}

request_uri = URI(request_token_url)
request = Net::HTTP::Post.new(request_uri)
request["Authorization"] = oauth_header("POST", request_token_url, request_params, consumer_secret)
response = Net::HTTP.start(request_uri.hostname, request_uri.port, use_ssl: true) { |http| http.request(request) }
abort "request token failed: #{response.code}" unless response.is_a?(Net::HTTPSuccess)

request_data = URI.decode_www_form(response.body).to_h
oauth_token = request_data.fetch("oauth_token")
oauth_token_secret = request_data.fetch("oauth_token_secret")
system("open", "https://api.twitter.com/oauth/authorize?oauth_token=#{encode(oauth_token)}")

print "PIN: "
pin = STDIN.gets&.strip
abort "PIN missing" if pin.to_s.empty?

access_token_url = "https://api.twitter.com/oauth/access_token"
access_params = {
  "oauth_consumer_key" => consumer_key,
  "oauth_nonce" => SecureRandom.hex(16),
  "oauth_signature_method" => "HMAC-SHA1",
  "oauth_timestamp" => Time.now.to_i.to_s,
  "oauth_token" => oauth_token,
  "oauth_verifier" => pin,
  "oauth_version" => "1.0"
}

access_uri = URI(access_token_url)
access_request = Net::HTTP::Post.new(access_uri)
access_request["Authorization"] = oauth_header("POST", access_token_url, access_params, consumer_secret, oauth_token_secret)
access_response = Net::HTTP.start(access_uri.hostname, access_uri.port, use_ssl: true) { |http| http.request(access_request) }
abort "access token failed: #{access_response.code}" unless access_response.is_a?(Net::HTTPSuccess)

access_data = URI.decode_www_form(access_response.body).to_h
authorized_username = access_data["screen_name"]
abort "authorized user is #{authorized_username}, expected #{target_username}" unless authorized_username == target_username

app["consumer_key"] = consumer_key
app["consumer_secret"] = consumer_secret
app["oauth1_token"] = {
  "type" => "oauth1",
  "oauth1" => {
    "access_token" => access_data.fetch("oauth_token"),
    "token_secret" => access_data.fetch("oauth_token_secret"),
    "consumer_key" => consumer_key,
    "consumer_secret" => consumer_secret
  }
}
config["default_app"] = app_name

File.write(config_path, YAML.dump(config))
File.chmod(0600, config_path)
puts "saved oauth1 token for #{authorized_username}"
