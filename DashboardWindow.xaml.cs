using System.Windows;
using System.Windows.Controls;
using System.Windows.Input;

namespace pANEL
{
    public partial class DashboardWindow : Window
    {
        private readonly string _owner;
        private readonly string _key;
        private readonly string _expiry;

        public DashboardWindow(string owner, string key, string expiry)
        {
            _owner  = owner;
            _key    = key;
            _expiry = expiry;
            InitializeComponent();
        }

        private void Window_Loaded(object sender, RoutedEventArgs e)
        {
            (Resources["DashFadeIn"] as System.Windows.Media.Animation.Storyboard)?.Begin();

            // Bind data
            TxtUserName.Text  = _owner.Length > 0 ? _owner : "User";
            TxtWelcome.Text   = $"Welcome back, {(_owner.Length > 0 ? _owner : "User")} 👋";
            TxtExpiry.Text    = _expiry.Length > 0 ? _expiry : "Lifetime";
            TxtKeyDisplay.Text = _key;

            // License page data
            TxtLicOwner.Text  = _owner.Length > 0 ? _owner : "—";
            TxtLicKey.Text    = _key;
            TxtLicExpiry.Text = _expiry.Length > 0 ? _expiry : "Lifetime";
        }

        // ── Drag ────────────────────────────────────────────────────
        private void TitleBar_MouseDown(object sender, MouseButtonEventArgs e)
        {
            if (e.ChangedButton == MouseButton.Left) DragMove();
        }

        // ── Window controls ──────────────────────────────────────────
        private void WinCtrl_Click(object sender, RoutedEventArgs e)
        {
            string tag = (sender as Button)?.Tag?.ToString() ?? "";
            if (tag == "Close")    Close();
            if (tag == "Min")      WindowState = WindowState.Minimized;
        }

        // ── Logout ───────────────────────────────────────────────────
        private void LogoutBtn_Click(object sender, RoutedEventArgs e)
        {
            var result = MessageBox.Show(
                "Are you sure you want to logout?",
                "Logout", MessageBoxButton.YesNo,
                MessageBoxImage.Question);

            if (result == MessageBoxResult.Yes)
            {
                new LoginWindow().Show();
                Close();
            }
        }

        // ── Navigation ───────────────────────────────────────────────
        private void NavBtn_Checked(object sender, RoutedEventArgs e)
        {
            if (PageDash == null) return; // not loaded yet

            // Hide all pages
            PageDash.Visibility    = Visibility.Collapsed;
            PageLicense.Visibility = Visibility.Collapsed;
            PageSettings.Visibility = Visibility.Collapsed;
            PageAbout.Visibility   = Visibility.Collapsed;

            // Show selected page
            if (sender == NavDash)    { PageDash.Visibility    = Visibility.Visible; TxtPageTitle.Text = "Dashboard"; }
            if (sender == NavLicense) { PageLicense.Visibility = Visibility.Visible; TxtPageTitle.Text = "My License"; }
            if (sender == NavSettings){ PageSettings.Visibility= Visibility.Visible; TxtPageTitle.Text = "Settings"; }
            if (sender == NavAbout)   { PageAbout.Visibility   = Visibility.Visible; TxtPageTitle.Text = "About"; }
        }
    }
}
