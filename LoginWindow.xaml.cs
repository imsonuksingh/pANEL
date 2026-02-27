using System.Text.RegularExpressions;
using System.Windows;
using System.Windows.Input;
using System.Windows.Media;
using System.Windows.Media.Animation;
using pANEL.Services;

namespace pANEL
{
    public partial class LoginWindow : Window
    {
        public LoginWindow()
        {
            InitializeComponent();
        }

        // ── Window load → start animations ──────────────────────────
        private void Window_Loaded(object sender, RoutedEventArgs e)
        {
            // 1. Fade-in + slide-up for MainCard (code-behind to avoid frozen transform)
            var fadeIn = new DoubleAnimation(0, 1, TimeSpan.FromSeconds(0.5));
            MainCard.BeginAnimation(OpacityProperty, fadeIn);

            var slideUp = new DoubleAnimation(30, 0, new Duration(TimeSpan.FromSeconds(0.5)))
            {
                EasingFunction = new CubicEase { EasingMode = EasingMode.EaseOut }
            };
            MainCardTrans.BeginAnimation(TranslateTransform.YProperty, slideUp);

            // 2. Shimmer sweep
            var shimmer = new DoubleAnimation(-460, 460, TimeSpan.FromSeconds(2.5))
            {
                RepeatBehavior = RepeatBehavior.Forever
            };
            ShimmerTrans.BeginAnimation(TranslateTransform.XProperty, shimmer);

            // 3. Pulse glow (safe — opacity on FrameworkElement)
            (Resources["PulseAnim"] as Storyboard)?.Begin(this, true);
        }

        // ── Drag window ──────────────────────────────────────────────
        private void TitleBar_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left) DragMove();
        }

        // ── Close ────────────────────────────────────────────────────
        private void CloseBtn_Click(object sender, RoutedEventArgs e) => Close();

        // ── Key input auto-format (XXXX-XXXX-XXXX-XXXX) ─────────────
        private bool _isFormatting;

        private void TxtKey_TextChanged(object sender, System.Windows.Controls.TextChangedEventArgs e)
        {
            if (_isFormatting) return;
            _isFormatting = true;

            int caret = TxtKey.CaretIndex;
            string raw = Regex.Replace(TxtKey.Text.ToUpper(), "[^A-Z0-9]", "");

            if (raw.Length > 16) raw = raw[..16];

            // Insert dashes every 4 chars
            string formatted = "";
            for (int i = 0; i < raw.Length; i++)
            {
                if (i > 0 && i % 4 == 0) formatted += "-";
                formatted += raw[i];
            }

            TxtKey.Text = formatted;
            TxtKey.CaretIndex = Math.Min(caret + (formatted.Length - TxtKey.Text.Length < 0 ? 1 : 0),
                                          formatted.Length);

            // Counter
            TxtCounter.Text = $"{raw.Length} / 16 chars";

            // Enable button only when full key entered
            BtnActivate.IsEnabled = raw.Length == 16;

            // Clear status
            HideStatus();

            _isFormatting = false;
        }

        // ── Enter key submits ────────────────────────────────────────
        private async void TxtKey_KeyDown(object sender, KeyEventArgs e)
        {
            if (e.Key == Key.Enter && BtnActivate.IsEnabled)
                await ValidateAsync();
        }

        // ── Activate button ──────────────────────────────────────────
        private async void BtnActivate_Click(object sender, RoutedEventArgs e)
            => await ValidateAsync();

        // ── Core validation ──────────────────────────────────────────
        private async Task ValidateAsync()
        {
            SetLoading(true);

            LicenseResult result = await FirebaseService.ValidateKeyAsync(TxtKey.Text);

            SetLoading(false);

            if (result.IsValid)
            {
                ShowStatus(result.Message, success: true);

                // Brief pause so user sees success, then open dashboard
                await Task.Delay(900);

                var dash = new DashboardWindow(result.Owner, TxtKey.Text, result.Expiry);
                dash.Show();
                Close();
            }
            else
            {
                ShowStatus(result.Message, success: false);
                ShakeWindow();
            }
        }

        // ── UI helpers ───────────────────────────────────────────────
        private void SetLoading(bool on)
        {
            LoadingBar.Visibility = on ? Visibility.Visible : Visibility.Collapsed;
            BtnActivate.IsEnabled = !on;
            TxtKey.IsEnabled      = !on;
        }

        private void ShowStatus(string msg, bool success)
        {
            StatusText.Text       = msg;
            StatusIcon.Text       = success ? "✅" : "❌";
            StatusBorder.Background = new SolidColorBrush(
                success ? Color.FromRgb(20, 83, 45) : Color.FromRgb(69, 10, 10));
            StatusText.Foreground = new SolidColorBrush(
                success ? Color.FromRgb(134, 239, 172) : Color.FromRgb(252, 165, 165));
            StatusBorder.Visibility = Visibility.Visible;
        }

        private void HideStatus()
        {
            StatusBorder.Visibility = Visibility.Collapsed;
        }

        // Shake animation on wrong key
        private async void ShakeWindow()
        {
            double orig = Left;
            int[] offsets = { -8, 8, -6, 6, -4, 4, 0 };
            foreach (int off in offsets)
            {
                Left = orig + off;
                await Task.Delay(40);
            }
            Left = orig;
        }
    }
}
