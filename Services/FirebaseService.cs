using System.Net.Http;
using System.Text.Json;
using System.Threading.Tasks;

namespace pANEL.Services
{
    /// <summary>
    /// Validates a license key against Firebase Firestore REST API.
    /// Collection: "license_keys"
    /// Document ID: the key itself (e.g. "ABCD-1234-EFGH-5678")
    /// Required fields: active (bool), owner (string), expiry (string yyyy-MM-dd)
    /// </summary>
    public class FirebaseService
    {
        // ─────────────────────────────────────────────────────────────
        //  FIREBASE CONFIG  — apni details yahan fill karo
        // ─────────────────────────────────────────────────────────────
        private const string PROJECT_ID  = "YOUR_PROJECT_ID";   // Firebase console > Project settings > General
        private const string API_KEY     = "YOUR_WEB_API_KEY";  // Firebase console > Project settings > Web API Key
        // ─────────────────────────────────────────────────────────────

        private static readonly HttpClient _http = new();

        // Firestore REST base
        private static string FirestoreBase =>
            $"https://firestore.googleapis.com/v1/projects/{PROJECT_ID}/databases/(default)/documents";

        /// <summary>
        /// Returns a LicenseResult — valid/invalid with details.
        /// </summary>
        public static async Task<LicenseResult> ValidateKeyAsync(string key)
        {
            if (string.IsNullOrWhiteSpace(key))
                return LicenseResult.Fail("Key boş olamaz.");

            string url = $"{FirestoreBase}/license_keys/{key.ToUpper()}?key={API_KEY}";

            try
            {
                HttpResponseMessage response = await _http.GetAsync(url);

                if (response.StatusCode == System.Net.HttpStatusCode.NotFound)
                    return LicenseResult.Fail("❌  Invalid key. This license does not exist.");

                if (!response.IsSuccessStatusCode)
                    return LicenseResult.Fail($"Server error: {(int)response.StatusCode}");

                string json = await response.Content.ReadAsStringAsync();
                using JsonDocument doc = JsonDocument.Parse(json);
                JsonElement root = doc.RootElement;

                // Parse Firestore field values
                bool   active = GetBool  (root, "active");
                string owner  = GetString(root, "owner");
                string expiry = GetString(root, "expiry");

                if (!active)
                    return LicenseResult.Fail("⛔  This license has been disabled.");

                // Expiry check
                if (!string.IsNullOrEmpty(expiry) &&
                    System.DateTime.TryParse(expiry, out var exp) &&
                    exp < System.DateTime.UtcNow)
                    return LicenseResult.Fail($"⌛  License expired on {exp:dd MMM yyyy}.");

                return LicenseResult.Ok(owner, expiry);
            }
            catch (HttpRequestException)
            {
                return LicenseResult.Fail("❗  No internet connection. Please check your network.");
            }
            catch (System.Exception ex)
            {
                return LicenseResult.Fail($"Unexpected error: {ex.Message}");
            }
        }

        // ─── Firestore value helpers ─────────────────────────────────

        private static string GetString(JsonElement root, string field)
        {
            try
            {
                return root
                    .GetProperty("fields")
                    .GetProperty(field)
                    .GetProperty("stringValue")
                    .GetString() ?? "";
            }
            catch { return ""; }
        }

        private static bool GetBool(JsonElement root, string field)
        {
            try
            {
                return root
                    .GetProperty("fields")
                    .GetProperty(field)
                    .GetProperty("booleanValue")
                    .GetBoolean();
            }
            catch { return false; }
        }
    }

    // ─── Result model ────────────────────────────────────────────────

    public class LicenseResult
    {
        public bool   IsValid { get; private set; }
        public string Message { get; private set; } = "";
        public string Owner   { get; private set; } = "";
        public string Expiry  { get; private set; } = "";

        public static LicenseResult Ok(string owner, string expiry) =>
            new() { IsValid = true,  Owner = owner, Expiry = expiry,
                     Message = $"✅  Welcome, {owner}!" };

        public static LicenseResult Fail(string msg) =>
            new() { IsValid = false, Message = msg };
    }
}
