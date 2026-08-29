<?php
$currentPage = 'terms';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" href="assets/images/favicon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Terms & Conditions — Authentiq</title>

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
        <h1 class="text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight font-display">Terms &amp; Conditions</h1>
        <p class="text-slate-550 text-xs mt-1 font-medium">Effective Date: July 14, 2026</p>
      </div>

      <!-- Content List -->
      <div class="space-y-8 text-left text-sm sm:text-base leading-relaxed text-slate-700 font-sans">

        <!-- Section 1 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">1. Acceptance of Terms</h2>
          <p>
            By accessing or using the website, billing portal, and services provided by qr Authentiq, you agree to be bound by these Terms &amp; Conditions. If you do not agree to all of these terms, you must stop using our services and leave the website immediately.
          </p>
        </section>

        <!-- Section 2 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">2. Services Description</h2>
          <p>
            Authentiq provides a digital product verification service to confirm the authenticity of goods via QR codes and unique serial identifiers.
          </p>
        </section>

        <!-- Section 3 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">3. User Obligations</h2>
          <div class="space-y-2">
            <div>
              <p class="font-semibold text-slate-800">Accuracy:</p>
              <p class="pl-4 text-slate-650">
                Users must provide truthful, complete, and accurate information when registering, subscribing to plans, or performing product verification checks.
              </p>
            </div>
            <div>
              <p class="font-semibold text-slate-800">Prohibited Use:</p>
              <p class="pl-4 text-slate-650">
                You are strictly prohibited from reverse-engineering, hacking, decompiling, or attempting to duplicate or replicate our security QR codes, serial nodes, or security validation protocols.
              </p>
            </div>
          </div>
        </section>

        <!-- Section 4 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">4. Intellectual Property</h2>
          <p>
            All content, verification algorithms, tracking frameworks, UI interfaces (including the HTML, JS, and CSS components of this website), trademarks, and the brand name "Authentiq" are the exclusive intellectual property of our company and are protected by international copyright and intellectual property laws.
          </p>
        </section>

        <!-- Section 5 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">5. Limitation of Liability</h2>
          <p>
            While Authentiq strives for accuracy, we cannot guarantee 100% detection of all counterfeit goods. We are not liable for any financial loss or damages resulting from the purchase of counterfeit items verified through our platform.
          </p>
        </section>

        <!-- Section 6 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">6. Billing and Payment Terms</h2>
          <p>
            Service fees, subscription plan payments, and billing details are processed securely. Subscriptions or service fees are non-refundable unless subscription terms specify otherwise. In the event of a payment failure, Authentiq reserves the right to suspend API access, verification dashboard records, and portal login access until outstanding balances are fully cleared.
          </p>
        </section>

        <!-- Section 7 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">7. Data Privacy</h2>
          <p>
            Your interaction with the site, queries to the verification nodes, and usage telemetry are also governed by our Privacy Policy, which details how we collect, process, and safeguard your data.
          </p>
        </section>

        <!-- Section 8 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">8. Termination</h2>
          <p>
            We reserve the right to suspend or terminate accounts, API keys, or verification permissions at our sole discretion, without prior notice, for users who misuse the platform, attempt duplicate scan fraud, or violate any terms written in this agreement.
          </p>
        </section>

        <!-- Section 9 -->
        <section class="space-y-2">
          <h2 class="text-lg font-bold text-slate-900 font-display">9. Governing Law</h2>
          <p>
            These terms shall be governed by, construed, and enforced in accordance with the laws of India. Any disputes arising under these terms shall be subject to the exclusive jurisdiction of the courts located in Jaipur, Rajasthan, India.
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
