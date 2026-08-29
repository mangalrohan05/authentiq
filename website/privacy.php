<?php
$currentPage = 'privacy';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" href="assets/images/favicon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Privacy Policy — Authentiq</title>

  <!-- Tailwind CSS Play CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Manrope', 'sans-serif'],
            display: ['Sora', 'sans-serif'],
          }
        }
      }
    }
  </script>

  <!-- Custom CSS Styles -->
  <link rel="stylesheet" href="assets/css/styles.css">
</head>
<body class="min-h-screen bg-slate-50 text-slate-800 antialiased font-sans selection:bg-[#16B981] selection:text-white">

  <!-- Header / Navbar Include -->
  <?php include 'components/navbar.php'; ?>

  <!-- Mobile Side Drawer Include -->
  <?php include 'components/sidedrawer.php'; ?>

  <div class="w-full min-h-screen bg-slate-50 pt-40 pb-16 md:pb-20 px-6 sm:px-12 animate-fadeIn">
    <div class="max-w-4xl mx-auto bg-white border border-slate-200 rounded-2xl shadow-xl p-8 md:p-12 text-left">

      <!-- Header -->
      <div class="border-b border-slate-200 pb-6 mb-8">
        <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight font-display">Privacy Policy</h1>
        <p class="text-slate-550 text-xs mt-1 font-medium">Effective Date: July 14, 2026</p>
      </div>

      <!-- Content List -->
      <div class="space-y-8 text-left text-sm sm:text-base leading-relaxed text-slate-700 font-sans">

        <!-- Section 1 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">1. Introduction</h2>
          <p>
            At qr Authentiq, we are committed to protecting and safeguarding your personal privacy. This Privacy Policy details how we collect, process, and protect your data when you access our website, use our product verification services, or access the billing dashboard.
          </p>
        </section>

        <!-- Section 2 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">2. What Information We Collect</h2>
          <div class="space-y-3">
            <div>
              <p class="font-semibold text-slate-800">Information You Provide:</p>
              <p class="pl-4 text-slate-600">
                We collect your name, email address, billing address, and contact details provided during account registration, subscription purchase, or support queries.
              </p>
            </div>
            <div>
              <p class="font-semibold text-slate-800">Information Collected Automatically:</p>
              <ul class="pl-4 list-disc space-y-1.5 text-slate-650 mt-1">
                <li>
                  <strong>Device &amp; Usage Data:</strong> IP address, browser type, operating system, and details of how you interact with the verification portal.
                </li>
                <li>
                  <strong>Geolocation:</strong> If you perform scan checks on secure products, we collect location telemetry to help track where verification checks are happening—an essential element for detecting counterfeit activity.
                </li>
                <li>
                  <strong>Cookies:</strong> We use cookies and similar session tokens to maintain session states and keep you logged into the billing dashboard.
                </li>
              </ul>
            </div>
          </div>
        </section>

        <!-- Section 3 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">3. How We Use Your Information</h2>
          <ul class="list-disc pl-4 space-y-1 text-slate-650">
            <li>
              <strong>Service Provision:</strong> To verify product authenticity, manage user accounts, and process subscription plans.
            </li>
            <li>
              <strong>Security &amp; Fraud Prevention:</strong> Utilizing scanning telemetry and IP records to identify suspicious or fraudulent duplication scanning patterns (e.g., a single secure QR code checked simultaneously across multiple countries).
            </li>
            <li>
              <strong>Communication:</strong> Sending transaction receipts, subscription notices, security updates, and responses to support inquiries.
            </li>
          </ul>
        </section>

        <!-- Section 4 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">4. Sharing of Information</h2>
          <div class="space-y-1.5 text-slate-650">
            <p>
              <strong>Third-Party Service Providers:</strong> We share necessary details with payment processors (e.g., Stripe, PayPal) and cloud hosting networks (e.g., AWS, Azure) to maintain site functionality.
            </p>
            <p>
              <strong>Legal Compliance:</strong> We reserve the right to disclose records if requested by law enforcement investigating counterfeit operations or supply chain violations.
            </p>
          </div>
        </section>

        <!-- Section 5 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">5. Data Security</h2>
          <p>
            We enforce strict cryptographic controls and safeguards to secure your database records. This includes military-grade encryption for all data in transit and at rest, secure server architecture, and access authorization locks to ensure zero unauthorized access to scan telemetry or payment records.
          </p>
        </section>

        <!-- Section 6 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">6. Your Privacy Rights</h2>
          <p>
            You have full rights to access, update, correct, or request the erasure of your personal database profile and telemetry history. To exercise these rights, please reach out to our data privacy team at <a href="mailto:privacy@authentiq.com" class="text-[#00b074] hover:underline font-semibold font-sans">privacy@authentiq.com</a>.
          </p>
        </section>

        <!-- Section 7 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">7. Retention Policy</h2>
          <p>
            We retain account setup data for as long as your corporate profile remains active. Transaction and payment logs are preserved longer in order to satisfy statutory tax, financial, and audit regulations.
          </p>
        </section>

        <!-- Section 8 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">8. Children’s Privacy</h2>
          <p>
            Our verification platform is not structured or intended for children. We do not knowingly compile or track details from individuals under the age of 13 (or 16, depending on regional data jurisdiction limits).
          </p>
        </section>

        <!-- Section 9 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">9. Changes to This Privacy Policy</h2>
          <p>
            We update this policy periodically to align with evolving anti-counterfeiting compliance protocols. Any material modifications will be announced on this page along with an updated effective date.
          </p>
        </section>

      </div>
    </div>
  </div>

  <!-- Footer Include -->
  <?php include 'components/footer.php'; ?>

  <!-- Scripts -->
  <script src="assets/js/scripts.js" defer></script>
</body>
</html>
