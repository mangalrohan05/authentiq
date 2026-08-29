<?php
$currentPage = 'billing';

// Extract selected plan info
$planId = isset($_GET['plan']) ? $_GET['plan'] : 'free';

$plans = [
    'free' => [
        'name' => 'Free Trial',
        'basePrice' => 0,
        'interval' => 'trial',
        'totalUsers' => 1,
        'totalSKUs' => 1,
        'totalBrands' => 1,
    ],
    'business' => [
        'name' => 'Business',
        'basePrice' => 55000,
        'interval' => 'yr',
        'totalUsers' => 5,
        'totalSKUs' => 25,
        'totalBrands' => 1,
    ],
    'pro' => [
        'name' => 'Business Pro',
        'basePrice' => 245000,
        'interval' => 'yr',
        'totalUsers' => 50,
        'totalSKUs' => 500,
        'totalBrands' => 5,
    ],
    'enterprise' => [
        'name' => 'Enterprise',
        'basePrice' => 0,
        'interval' => 'yr',
        'totalUsers' => 999999,
        'totalSKUs' => 999999,
        'totalBrands' => 999999,
    ]
];

$selectedPlan = isset($plans[$planId]) ? $plans[$planId] : $plans['free'];

$taxRate = 0.18;
$calculatedTax = $selectedPlan['basePrice'] * $taxRate;
$totalAmount = $selectedPlan['basePrice'] + $calculatedTax;
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" href="assets/images/favicon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Account Registration — Authentiq</title>

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

  <div class="min-h-screen pt-32 sm:pt-36 pb-16 md:pb-20 px-3 sm:px-6 lg:px-8">
    <div class="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8 lg:gap-10 items-start">
      
      <!-- Left Column: Form & Stepper -->
      <form id="checkout-form" class="lg:col-span-8 bg-white border border-slate-200/80 rounded-2xl sm:rounded-3xl shadow-xl p-5 sm:p-8 lg:p-10 space-y-8 text-left">
        
        <div class="border-b border-slate-150 pb-8">
          <div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
            <div>
              <h2 class="text-3xl font-light text-[#003057] mt-3">Account Registration</h2>
              <p class="text-xs text-slate-500 mt-1 font-normal">Create your initial vendor shell to proceed to payment.</p>
            </div>
            <div id="step-badge" class="bg-[#003057] text-white px-6 py-2.5 rounded-full text-xs font-semibold tracking-wider">
              Step 1 of 2
            </div>
          </div>
        </div>

        <!-- ==================== STEP 1: USER INFO ==================== -->
        <div id="step-user-info" class="space-y-6 animate-fadeIn">
          <div class="grid grid-cols-1 md:grid-cols-2 gap-6">
            
            <!-- Legal Company Name -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-500">Legal Company Name *</label>
              <input
                type="text"
                id="legalName"
                placeholder="Acme Brands Pvt Ltd"
                class="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 font-normal transition-colors placeholder-slate-400"
              />
              <p id="error-legalName" class="text-[10px] text-red-500 font-medium hidden"></p>
            </div>

            <!-- Company Type -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-550">Company Type *</label>
              <select
                id="companyType"
                class="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 font-sans transition-colors cursor-pointer"
              >
                <option value="">Select Structure</option>
                <option value="Proprietorship">Proprietorship</option>
                <option value="Partnership">Partnership Firm</option>
                <option value="LLP">Limited Liability Partnership (LLP)</option>
                <option value="Pvt Ltd">Private Limited (Pvt Ltd)</option>
                <option value="Public Ltd">Public Limited Co.</option>
              </select>
              <p id="error-companyType" class="text-[10px] text-red-500 font-medium hidden"></p>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4 border-t border-slate-150">
            <!-- Industry / Sector -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-500">Industry / Sector *</label>
              <select
                id="industry"
                class="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-[#00b074] text-slate-800"
              >
                <option value="">Select Sector</option>
                <option value="FMCG">FMCG / Food / Retail</option>
                <option value="Pharma">Pharma / Healthcare</option>
                <option value="Agro">Agro / Chemicals</option>
                <option value="Liquor">Liquor / Alcohol</option>
                <option value="Electronics">Electronics / Hardware</option>
                <option value="Manufacturing">Heavy Manufacturing</option>
                <option value="Other">Other Services</option>
              </select>
              <p id="error-industry" class="text-[10px] text-red-500 hidden"></p>
            </div>
            
            <!-- Company Website -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-550">Company Website</label>
              <input
                type="url"
                id="website"
                placeholder="https://www.acmebrands.com"
                class="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800"
              />
            </div>
          </div>

          <div class="pt-6 border-t border-slate-150 space-y-6">
            <h3 class="text-sm font-semibold text-[#003057] uppercase tracking-wider">Account Credentials</h3>

            <!-- Full Name -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-500">Full Name *</label>
              <input 
                type="text" 
                id="fullName"
                placeholder="John Doe" 
                class="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800"
              />
              <p id="error-fullName" class="text-[10px] text-red-500 hidden"></p>
            </div>

            <!-- Work Email -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-500">Work Email *</label>
              <div class="flex gap-2">
                <input 
                  type="email" 
                  id="email"
                  placeholder="john@acmebrands.com" 
                  class="flex-1 min-w-0 bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800"
                />
                <div class="flex-shrink-0">
                  <div id="email-verified-badge" class="h-full flex items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-xl font-bold text-[10px] sm:text-xs uppercase tracking-wider py-3 px-3 sm:px-4 whitespace-nowrap hidden">
                    <span>✓ Verified</span>
                  </div>
                  <button 
                    type="button"
                    id="verify-email-btn"
                    class="h-full bg-[#00b074] hover:bg-[#009660] text-white font-bold rounded-xl text-[10px] sm:text-xs uppercase tracking-wider py-3 px-3 sm:px-4 cursor-pointer whitespace-nowrap"
                  >
                    Verify Email
                  </button>
                </div>
              </div>
              <p id="error-email" class="text-[10px] text-red-500 hidden"></p>
            </div>

            <!-- Mobile Number -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-500">Mobile Number *</label>
              <div class="flex gap-2">
                <div class="flex gap-2 flex-1 min-w-0">
                  <span class="flex items-center bg-slate-100 border border-slate-200 rounded-xl px-3 text-slate-500 font-sans text-sm font-semibold select-none flex-shrink-0">
                    +91
                  </span>
                  <input
                    type="tel"
                    id="phone"
                    placeholder="9876543210"
                    maxlength="10"
                    class="flex-1 min-w-0 bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800"
                  />
                </div>
                <div class="flex-shrink-0">
                  <div id="phone-verified-badge" class="h-full flex items-center justify-center gap-1.5 bg-emerald-50 border border-emerald-200 text-emerald-600 rounded-xl font-bold text-[10px] sm:text-xs uppercase tracking-wider py-3 px-3 sm:px-4 whitespace-nowrap hidden">
                    <span>✓ Verified</span>
                  </div>
                  <button 
                    type="button"
                    id="verify-phone-btn"
                    class="h-full bg-[#00b074] hover:bg-[#009660] text-white font-bold rounded-xl text-[10px] sm:text-xs uppercase tracking-wider py-3 px-3 sm:px-4 cursor-pointer whitespace-nowrap"
                  >
                    Verify Mobile
                  </button>
                </div>
              </div>
              <p id="error-phone" class="text-[10px] text-red-500 hidden"></p>
            </div>

            <!-- Designation -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-550">Designation / Role *</label>
              <input 
                type="text" 
                id="designation"
                placeholder="Director / Brand Manager / Operations Manager" 
                class="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800"
              />
              <p id="error-designation" class="text-[10px] text-red-500 hidden"></p>
            </div>

            <!-- Password Suggestion Banner -->
            <div class="text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 rounded-xl px-4.5 py-3 animate-fadeIn text-left col-span-1 md:col-span-2">
              <span>
                Recommended Strong Password: <span id="suggested-pwd" class="font-mono bg-emerald-50 px-2 py-0.5 border border-emerald-200/50 rounded text-emerald-800 font-bold select-all select-text cursor-text"></span>
              </span>
            </div>

            <!-- Create Password -->
            <div class="space-y-1.5 relative">
              <div class="flex justify-between items-center">
                <label class="block text-xs font-bold uppercase tracking-wider text-slate-500">Create Account Password *</label>
                <button
                  type="button"
                  id="use-suggested-btn"
                  class="text-[9px] text-[#00b074] hover:underline font-bold flex items-center gap-1 cursor-pointer select-none"
                >
                  🔄 Use Suggested Strong Password
                </button>
              </div>
              <div class="relative">
                <input 
                  type="password" 
                  id="password"
                  placeholder="••••••••" 
                  maxlength="12"
                  class="w-full bg-slate-50/50 border border-slate-200 rounded-xl pl-4 pr-12 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800"
                />
                <button
                  type="button"
                  id="toggle-pwd-btn"
                  class="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-450 hover:text-slate-700 text-[10px] font-bold uppercase tracking-wider select-none cursor-pointer"
                >
                  Show
                </button>
              </div>

              <!-- Password Strength Meter -->
              <div id="strength-meter-container" class="bg-slate-50 border border-slate-200/60 rounded-xl p-3.5 mt-2.5 space-y-2.5 hidden">
                <div class="flex justify-between items-center text-[10px] font-bold">
                  <span class="text-slate-500 uppercase tracking-wider">Complexity Strength:</span>
                  <span id="strength-label" class="uppercase tracking-wider">Empty</span>
                </div>
                <div class="w-full bg-slate-200 h-1.5 rounded-full overflow-hidden">
                  <div id="strength-bar" class="h-full bg-slate-200 transition-all duration-500" style="width: 0%;"></div>
                </div>
                <div class="grid grid-cols-2 gap-x-4 gap-y-1 text-[9px] font-semibold text-slate-500 pt-0.5">
                  <div class="flex items-center gap-1.5">
                    <span id="chk-len" class="text-slate-350">•</span>
                    <span id="txt-len" class="text-slate-450">Min 8 characters</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span id="chk-let" class="text-slate-350">•</span>
                    <span id="txt-let" class="text-slate-450">Contains a letter</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span id="chk-num" class="text-slate-350">•</span>
                    <span id="txt-num" class="text-slate-450">Contains a number</span>
                  </div>
                  <div class="flex items-center gap-1.5">
                    <span id="chk-case" class="text-slate-350">•</span>
                    <span id="txt-case" class="text-slate-450">Mixed case letters</span>
                  </div>
                  <div class="flex items-center gap-1.5 col-span-2">
                    <span id="chk-spec" class="text-slate-350">•</span>
                    <span id="txt-spec" class="text-slate-450">Special character (e.g. !@#$%)</span>
                  </div>
                </div>
              </div>
              <p id="error-password" class="text-[10px] text-red-500 font-semibold hidden"></p>
            </div>

            <!-- Confirm Password -->
            <div class="space-y-1.5">
              <label class="block text-xs font-bold uppercase tracking-wider text-slate-500">Confirm Account Password *</label>
              <input 
                type="password" 
                id="confirmPassword"
                placeholder="••••••••" 
                maxlength="12"
                class="w-full bg-slate-50/50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800"
              />
              <p id="error-confirmPassword" class="text-[10px] text-red-500 font-semibold hidden"></p>
            </div>
          </div>
        </div>

        <!-- ==================== STEP 2: CONSENT ==================== -->
        <div id="step-payment" class="space-y-6 animate-fadeIn hidden">
          <div>
            <h3 class="text-lg font-medium text-[#003057]">Terms & Consent Checklist</h3>
            <p class="text-xs text-slate-500 mt-1">Accept operating criteria to execute verification onboarding.</p>
          </div>

          <div class="space-y-4">
            <!-- Agree Terms -->
            <label class="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/50 transition-colors">
              <input type="checkbox" id="agreeTerms" class="mt-1" />
              <div>
                <span class="text-xs font-bold text-[#003057] block">I agree to the Terms of Service *</span>
                <span class="text-[10px] text-slate-450">Accept terms regarding platform usage, SLA thresholds, and payment commits.</span>
                <p id="error-agreeTerms" class="text-[10px] text-red-500 font-semibold hidden"></p>
              </div>
            </label>

            <!-- Agree Privacy -->
            <label class="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/50 transition-colors">
              <input type="checkbox" id="agreePrivacy" class="mt-1" />
              <div>
                <span class="text-xs font-bold text-[#003057] block">I agree to the Privacy Policy *</span>
                <span class="text-[10px] text-slate-450">Authorize processing of registered brand metadata profiles securely.</span>
                <p id="error-agreePrivacy" class="text-[10px] text-red-500 font-semibold hidden"></p>
              </div>
            </label>

            <!-- Agree Data Audits -->
            <label class="flex items-start gap-3 p-4 bg-slate-50 border border-slate-200 rounded-xl cursor-pointer hover:bg-slate-100/50 transition-colors">
              <input type="checkbox" id="agreeDataProcessing" class="mt-1" />
              <div>
                <span class="text-xs font-bold text-[#003057] block">Consent to Data Audits *</span>
                <span class="text-[10px] text-slate-450">Acknowledge that audit logs will record generated QR identifiers.</span>
                <p id="error-agreeDataProcessing" class="text-[10px] text-red-500 font-semibold hidden"></p>
              </div>
            </label>
          </div>
        </div>

        <!-- Navigation Buttons -->
        <div class="flex flex-wrap justify-between items-center gap-3 border-t border-slate-150 pt-6">
          <button
            type="button"
            id="back-btn"
            class="border border-slate-200 hover:bg-slate-50 text-slate-550 font-semibold py-3.5 px-8 rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer hidden"
          >
            ← Back Step
          </button>
          <div id="placeholder-btn"></div> <!-- Left spacer when Back is hidden -->

          <button
            type="button"
            id="next-btn"
            class="bg-[#00b074] hover:bg-[#009660] text-white font-bold py-3.5 px-8 rounded-xl text-xs uppercase tracking-wider transition-all duration-200 cursor-pointer shadow-md"
          >
            Next Step →
          </button>

          <button
            type="submit"
            id="submit-btn"
            class="bg-[#00b074] hover:bg-[#009660] text-white font-extrabold py-4 px-10 rounded-xl text-xs uppercase tracking-widest transition-all duration-200 cursor-pointer hidden"
          >
            <?php echo $selectedPlan['basePrice'] > 0 ? 'Complete Payment & Register' : 'Activate Free Trial'; ?>
          </button>
        </div>
      </form>

      <!-- Right Column: Invoice Summary Card -->
      <div class="lg:col-span-4 bg-slate-50 border border-slate-200 rounded-2xl sm:rounded-3xl shadow-lg overflow-hidden lg:sticky lg:top-28 text-left animate-fadeIn">
        <div class="bg-[#003057] p-5.5 text-white text-center border-b border-[#001e36] py-5">
          <h2 class="text-lg font-light tracking-tight">Invoice Summary</h2>
          <p class="text-slate-300 text-[10px] font-normal uppercase tracking-wider mt-0.5">Plan Allocation Metrics</p>
        </div>

        <div class="p-6 space-y-6">
          <div class="bg-white rounded-2xl p-5 border border-slate-150 space-y-4 shadow-sm">
            <div class="flex justify-between items-center pb-2.5 border-b border-slate-150">
              <span class="text-slate-400 text-[10px] font-bold uppercase tracking-wider">Tier Name</span>
              <span class="text-[#00b074] font-bold text-xs px-2.5 py-0.5 bg-[#00b074]/10 border border-[#00b074]/20 rounded-md">
                <?php echo $selectedPlan['name']; ?>
              </span>
            </div>

            <div class="flex justify-between items-center text-xs font-normal">
              <span class="text-slate-550">Base Plan Charge</span>
              <span class="text-slate-800 font-bold">₹<?php echo number_format($selectedPlan['basePrice'], 0, '.', ','); ?></span>
            </div>

            <div class="flex justify-between items-center text-xs font-normal">
              <span class="text-slate-550">Tax Levy (18% GST)</span>
              <span class="text-slate-800 font-bold">₹<?php echo number_format($calculatedTax, 2, '.', ','); ?></span>
            </div>

            <div class="flex justify-between items-center pt-3 border-t border-slate-150">
              <span class="text-[#00b074] font-extrabold text-xs uppercase tracking-wider">Gross Total</span>
              <div class="text-right">
                <span class="text-xl font-black text-[#003057]">₹<?php echo number_format($totalAmount, 2, '.', ','); ?></span>
                <span class="text-slate-450 text-[10px] font-normal block mt-0.5">
                  /<?php echo $selectedPlan['interval'] === 'trial' ? 'trial' : ($selectedPlan['interval'] === 'mo' ? 'mo' : 'yr'); ?>
                </span>
              </div>
            </div>
          </div>

          <div class="flex items-center gap-3.5 bg-slate-100/50 border border-slate-200 rounded-xl p-4.5">
            <span class="text-xl select-none">🛡️</span>
            <p class="text-[10px] text-slate-500 font-normal leading-relaxed">
              Safe & secure checkout. Your data is protected, and you can upgrade, downgrade, or cancel your plan at any time from your settings.
            </p>
          </div>
        </div>
      </div>

    </div>
  </div>

  <!-- SMS Sim OTP Modal -->
  <div id="otp-sms-modal" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-3xl p-8 max-w-sm w-full space-y-6 text-center shadow-2xl border border-slate-100 animate-fadeIn">
      <div>
        <span class="text-xl">💬</span>
        <h3 class="text-lg font-bold text-[#003057] mt-3">SMS Verification Simulator</h3>
        <p class="text-xs text-slate-500 mt-1.5 font-normal">
          We sent a verification SMS to <span id="sms-phone-span" class="font-semibold text-slate-800"></span>.
        </p>
      </div>
      <div class="bg-[#00b074]/10 border border-[#00b074]/20 rounded-xl p-3.5 text-left text-xs text-[#00b074] space-y-1">
        <span class="font-bold">⚠️ Test Simulator Hint:</span>
        <p class="font-normal">Enter code <span class="font-black underline tracking-widest text-[#003057] font-sans">1234</span> to successfully complete OTP validation.</p>
      </div>
      <div class="space-y-1.5 text-left">
        <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">4-Digit Security OTP</label>
        <input
          type="text"
          id="sms-otp-input"
          maxlength="4"
          placeholder="0 0 0 0"
          class="w-full text-center text-xl font-bold tracking-[0.75em] bg-slate-50 border border-slate-200 rounded-xl py-3.5 focus:outline-none focus:border-[#00b074] font-mono text-slate-800"
        />
        <p id="error-sms-otp" class="text-[10px] text-red-500 font-semibold hidden"></p>
      </div>
      <div class="flex gap-3 pt-2">
        <button type="button" id="cancel-sms-otp-btn" class="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-500 font-semibold py-3 rounded-xl text-xs uppercase cursor-pointer">
          Cancel
        </button>
        <button type="button" id="verify-sms-otp-btn" class="flex-1 bg-[#00b074] hover:bg-[#009660] text-white font-bold py-3 rounded-xl text-xs uppercase cursor-pointer">
          Verify Code
        </button>
      </div>
    </div>
  </div>

  <!-- Email Sim OTP Modal -->
  <div id="otp-email-modal" class="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 hidden">
    <div class="bg-white rounded-3xl p-8 max-w-sm w-full space-y-6 text-center shadow-2xl border border-slate-100 animate-fadeIn">
      <div>
        <span class="text-xl">📧</span>
        <h3 class="text-lg font-bold text-[#003057] mt-3">Email Verification Simulator</h3>
        <p class="text-xs text-slate-500 mt-1.5 font-normal">
          We sent a verification code to <span id="email-span" class="font-semibold text-slate-800"></span>.
        </p>
      </div>
      <div class="bg-[#00b074]/10 border border-[#00b074]/20 rounded-xl p-3.5 text-left text-xs text-[#00b074] space-y-1">
        <span class="font-bold">⚠️ Test Simulator Hint:</span>
        <p class="font-normal">Enter code <span class="font-black underline tracking-widest text-[#003057] font-sans">1234</span> to successfully complete email verification.</p>
      </div>
      <div class="space-y-1.5 text-left">
        <label class="block text-[10px] font-bold text-slate-400 uppercase tracking-wider">4-Digit Security OTP</label>
        <input 
          type="text" 
          id="email-otp-input"
          maxlength="4"
          placeholder="0 0 0 0" 
          class="w-full text-center text-xl font-bold tracking-[0.75em] bg-slate-50 border border-slate-200 rounded-xl py-3.5 focus:outline-none focus:border-[#00b074] font-mono text-slate-800"
        />
        <p id="error-email-otp" class="text-[10px] text-red-500 font-semibold hidden"></p>
      </div>
      <div class="flex gap-3 pt-2">
        <button type="button" id="cancel-email-otp-btn" class="flex-1 border border-slate-200 hover:bg-slate-50 text-slate-500 font-semibold py-3 rounded-xl text-xs uppercase cursor-pointer">
          Cancel
        </button>
        <button type="button" id="verify-email-otp-btn" class="flex-1 bg-[#00b074] hover:bg-[#009660] text-white font-bold py-3 rounded-xl text-xs uppercase cursor-pointer">
          Verify Code
        </button>
      </div>
    </div>
  </div>

  <!-- Footer Include -->
  <?php include 'components/footer.php'; ?>

  <!-- Scripts -->
  <script src="assets/js/scripts.js" defer></script>
  
  <!-- Interactive Form and Logic Script -->
  <script>
    document.addEventListener('DOMContentLoaded', () => {
      // Setup suggested password
      const characters = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
      let suggested = '';
      suggested += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)];
      suggested += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)];
      suggested += '0123456789'[Math.floor(Math.random() * 10)];
      suggested += '!@#$%^&*'[Math.floor(Math.random() * 8)];
      for (let i = 0; i < 8; i++) {
        suggested += characters[Math.floor(Math.random() * characters.length)];
      }
      suggested = suggested.split('').sort(() => 0.5 - Math.random()).join('');
      document.getElementById('suggested-pwd').textContent = suggested;

      // OTP Verification state variables
      let isEmailVerified = false;
      let isPhoneVerified = false;

      // DOM Elements
      const stepUserInfo = document.getElementById('step-user-info');
      const stepPayment = document.getElementById('step-payment');
      const stepBadge = document.getElementById('step-badge');
      const backBtn = document.getElementById('back-btn');
      const placeholderBtn = document.getElementById('placeholder-btn');
      const nextBtn = document.getElementById('next-btn');
      const submitBtn = document.getElementById('submit-btn');

      // Modals
      const otpSmsModal = document.getElementById('otp-sms-modal');
      const otpEmailModal = document.getElementById('otp-email-modal');
      const verifyEmailBtn = document.getElementById('verify-email-btn');
      const verifyPhoneBtn = document.getElementById('verify-phone-btn');

      // Verification simulator logic
      verifyEmailBtn.addEventListener('click', () => {
        const email = document.getElementById('email').value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) {
          showInputError('email', 'Enter a valid work email first');
          return;
        }
        clearInputError('email');
        document.getElementById('email-span').textContent = email;
        document.getElementById('email-otp-input').value = '';
        document.getElementById('error-email-otp').classList.add('hidden');
        otpEmailModal.classList.remove('hidden');
      });

      document.getElementById('cancel-email-otp-btn').addEventListener('click', () => {
        otpEmailModal.classList.add('hidden');
      });

      document.getElementById('verify-email-otp-btn').addEventListener('click', () => {
        const code = document.getElementById('email-otp-input').value;
        if (code === '1234') {
          isEmailVerified = true;
          otpEmailModal.classList.add('hidden');
          verifyEmailBtn.classList.add('hidden');
          document.getElementById('email-verified-badge').classList.remove('hidden');
          clearInputError('email');
        } else {
          document.getElementById('error-email-otp').textContent = 'Invalid OTP code. Please enter 1234.';
          document.getElementById('error-email-otp').classList.remove('hidden');
        }
      });

      verifyPhoneBtn.addEventListener('click', () => {
        const phone = document.getElementById('phone').value.trim();
        if (!phone || phone.length !== 10) {
          showInputError('phone', 'Enter a valid 10-digit mobile number');
          return;
        }
        clearInputError('phone');
        document.getElementById('sms-phone-span').textContent = phone;
        document.getElementById('sms-otp-input').value = '';
        document.getElementById('error-sms-otp').classList.add('hidden');
        otpSmsModal.classList.remove('hidden');
      });

      document.getElementById('cancel-sms-otp-btn').addEventListener('click', () => {
        otpSmsModal.classList.add('hidden');
      });

      document.getElementById('verify-sms-otp-btn').addEventListener('click', () => {
        const code = document.getElementById('sms-otp-input').value;
        if (code === '1234') {
          isPhoneVerified = true;
          otpSmsModal.classList.add('hidden');
          verifyPhoneBtn.classList.add('hidden');
          document.getElementById('phone-verified-badge').classList.remove('hidden');
          clearInputError('phone');
        } else {
          document.getElementById('error-sms-otp').textContent = 'Invalid OTP code. Please enter 1234.';
          document.getElementById('error-sms-otp').classList.remove('hidden');
        }
      });

      // Use suggested password btn
      document.getElementById('use-suggested-btn').addEventListener('click', () => {
        const pwd = document.getElementById('suggested-pwd').textContent;
        document.getElementById('password').value = pwd;
        document.getElementById('confirmPassword').value = pwd;
        clearInputError('password');
        clearInputError('confirmPassword');
        triggerStrengthMeter(pwd);
      });

      // Toggle password visibility
      const togglePwdBtn = document.getElementById('toggle-pwd-btn');
      const pwdInput = document.getElementById('password');
      togglePwdBtn.addEventListener('click', () => {
        if (pwdInput.type === 'password') {
          pwdInput.type = 'text';
          togglePwdBtn.textContent = 'Hide';
        } else {
          pwdInput.type = 'password';
          togglePwdBtn.textContent = 'Show';
        }
      });

      // Password Complexity Logic
      pwdInput.addEventListener('input', (e) => {
        triggerStrengthMeter(e.target.value);
      });

      function triggerStrengthMeter(pwd) {
        const container = document.getElementById('strength-meter-container');
        if (!pwd) {
          container.classList.add('hidden');
          return;
        }
        container.classList.remove('hidden');

        let score = 0;
        if (pwd.length >= 8) { score++; document.getElementById('chk-len').textContent = '✓'; document.getElementById('chk-len').className = 'text-emerald-500 font-bold'; document.getElementById('txt-len').className = 'text-slate-800'; }
        else { document.getElementById('chk-len').textContent = '•'; document.getElementById('chk-len').className = 'text-slate-350'; document.getElementById('txt-len').className = 'text-slate-455'; }

        if (/[A-Za-z]/.test(pwd)) { score++; document.getElementById('chk-let').textContent = '✓'; document.getElementById('chk-let').className = 'text-emerald-500 font-bold'; document.getElementById('txt-let').className = 'text-slate-800'; }
        else { document.getElementById('chk-let').textContent = '•'; document.getElementById('chk-let').className = 'text-slate-350'; document.getElementById('txt-let').className = 'text-slate-455'; }

        if (/\d/.test(pwd)) { score++; document.getElementById('chk-num').textContent = '✓'; document.getElementById('chk-num').className = 'text-emerald-500 font-bold'; document.getElementById('txt-num').className = 'text-slate-800'; }
        else { document.getElementById('chk-num').textContent = '•'; document.getElementById('chk-num').className = 'text-slate-350'; document.getElementById('txt-num').className = 'text-slate-455'; }

        if (/[A-Z]/.test(pwd) && /[a-z]/.test(pwd)) { score++; document.getElementById('chk-case').textContent = '✓'; document.getElementById('chk-case').className = 'text-emerald-500 font-bold'; document.getElementById('txt-case').className = 'text-slate-800'; }
        else { document.getElementById('chk-case').textContent = '•'; document.getElementById('chk-case').className = 'text-slate-350'; document.getElementById('txt-case').className = 'text-slate-455'; }

        if (/[^a-zA-Z0-9]/.test(pwd)) { score++; document.getElementById('chk-spec').textContent = '✓'; document.getElementById('chk-spec').className = 'text-emerald-500 font-bold'; document.getElementById('txt-spec').className = 'text-slate-800'; }
        else { document.getElementById('chk-spec').textContent = '•'; document.getElementById('chk-spec').className = 'text-slate-350'; document.getElementById('txt-spec').className = 'text-slate-455'; }

        const scoreCapped = Math.min(score, 4);
        const labelEl = document.getElementById('strength-label');
        const barEl = document.getElementById('strength-bar');

        barEl.className = 'h-full transition-all duration-500 ';
        if (scoreCapped === 0) {
          labelEl.textContent = 'Very Weak'; labelEl.className = 'text-red-500 uppercase tracking-wider';
          barEl.className += 'bg-red-500'; barEl.style.width = '10%';
        } else if (scoreCapped === 1) {
          labelEl.textContent = 'Weak'; labelEl.className = 'text-orange-500 uppercase tracking-wider';
          barEl.className += 'bg-orange-500'; barEl.style.width = '25%';
        } else if (scoreCapped === 2) {
          labelEl.textContent = 'Medium'; labelEl.className = 'text-yellow-600 uppercase tracking-wider';
          barEl.className += 'bg-yellow-500'; barEl.style.width = '50%';
        } else if (scoreCapped === 3) {
          labelEl.textContent = 'Strong'; labelEl.className = 'text-lime-650 uppercase tracking-wider';
          barEl.className += 'bg-lime-500'; barEl.style.width = '75%';
        } else {
          labelEl.textContent = 'Very Strong'; labelEl.className = 'text-[#00b074] uppercase tracking-wider';
          barEl.className += 'bg-[#00b074]'; barEl.style.width = '100%';
        }
      }

      // Input helper functions
      function showInputError(id, msg) {
        const el = document.getElementById('error-' + id);
        if (el) {
          el.textContent = msg;
          el.classList.remove('hidden');
        }
        const inputEl = document.getElementById(id);
        if (inputEl) {
          inputEl.classList.add('border-red-500', 'ring-1', 'ring-red-500');
        }
      }

      function clearInputError(id) {
        const el = document.getElementById('error-' + id);
        if (el) {
          el.classList.add('hidden');
        }
        const inputEl = document.getElementById(id);
        if (inputEl) {
          inputEl.classList.remove('border-red-500', 'ring-1', 'ring-red-500');
        }
      }

      // Steps Switching logic
      nextBtn.addEventListener('click', () => {
        let hasErrors = false;

        // Legal name check
        const legalName = document.getElementById('legalName').value.trim();
        if (!legalName) { showInputError('legalName', 'Company name is required'); hasErrors = true; }
        else clearInputError('legalName');

        // Company structure check
        const companyType = document.getElementById('companyType').value;
        if (!companyType) { showInputError('companyType', 'Company type is required'); hasErrors = true; }
        else clearInputError('companyType');

        // Sector check
        const industry = document.getElementById('industry').value;
        if (!industry) { showInputError('industry', 'Industry/sector is required'); hasErrors = true; }
        else clearInputError('industry');

        // Full name check
        const fullName = document.getElementById('fullName').value.trim();
        if (!fullName) { showInputError('fullName', 'Full name is required'); hasErrors = true; }
        else clearInputError('fullName');

        // Email check
        const email = document.getElementById('email').value.trim();
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!email || !emailRegex.test(email)) { showInputError('email', 'Invalid email address'); hasErrors = true; }
        else if (!isEmailVerified) { showInputError('email', 'Email OTP verification required'); hasErrors = true; }
        else clearInputError('email');

        // Phone check
        const phone = document.getElementById('phone').value.trim();
        if (!phone || phone.length !== 10) { showInputError('phone', 'Invalid 10-digit mobile number'); hasErrors = true; }
        else if (!isPhoneVerified) { showInputError('phone', 'Mobile OTP verification required'); hasErrors = true; }
        else clearInputError('phone');

        // Designation check
        const designation = document.getElementById('designation').value.trim();
        if (!designation) { showInputError('designation', 'Designation/role is required'); hasErrors = true; }
        else clearInputError('designation');

        // Password check
        const password = pwdInput.value;
        if (!password) { showInputError('password', 'Account password is required'); hasErrors = true; }
        else if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
          showInputError('password', 'Password must include at least 8 characters, a letter, and a number.');
          hasErrors = true;
        } else clearInputError('password');

        // Confirm password check
        const confirmPassword = document.getElementById('confirmPassword').value;
        if (!confirmPassword) { showInputError('confirmPassword', 'Confirm password is required'); hasErrors = true; }
        else if (password !== confirmPassword) { showInputError('confirmPassword', 'Passwords do not match'); hasErrors = true; }
        else clearInputError('confirmPassword');

        if (!hasErrors) {
          // Switch UI to step 2
          stepUserInfo.classList.add('hidden');
          stepPayment.classList.remove('hidden');
          nextBtn.classList.add('hidden');
          placeholderBtn.classList.add('hidden');
          backBtn.classList.remove('hidden');
          submitBtn.classList.remove('hidden');
          stepBadge.textContent = 'Step 2 of 2';
        }
      });

      backBtn.addEventListener('click', () => {
        stepPayment.classList.add('hidden');
        stepUserInfo.classList.remove('hidden');
        submitBtn.classList.add('hidden');
        backBtn.classList.add('hidden');
        nextBtn.classList.remove('hidden');
        placeholderBtn.classList.remove('hidden');
        stepBadge.textContent = 'Step 1 of 2';
      });

      // Submit form
      const checkoutForm = document.getElementById('checkout-form');
      checkoutForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        
        let hasErrors = false;
        
        // Consent checking
        const agreeTerms = document.getElementById('agreeTerms').checked;
        const agreePrivacy = document.getElementById('agreePrivacy').checked;
        const agreeDataProcessing = document.getElementById('agreeDataProcessing').checked;

        if (!agreeTerms) { showInputError('agreeTerms', 'Acceptance required'); hasErrors = true; }
        else clearInputError('agreeTerms');

        if (!agreePrivacy) { showInputError('agreePrivacy', 'Acceptance required'); hasErrors = true; }
        else clearInputError('agreePrivacy');

        if (!agreeDataProcessing) { showInputError('agreeDataProcessing', 'Consent required'); hasErrors = true; }
        else clearInputError('agreeDataProcessing');

        if (hasErrors) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Processing...';

        const payload = {
          legalName: document.getElementById('legalName').value.trim(),
          companyType: document.getElementById('companyType').value,
          industry: document.getElementById('industry').value,
          website: document.getElementById('website').value.trim() || null,
          fullName: document.getElementById('fullName').value.trim(),
          email: document.getElementById('email').value.trim(),
          phone: document.getElementById('phone').value.trim(),
          designation: document.getElementById('designation').value.trim(),
          password: pwdInput.value,
          planName: '<?php echo $selectedPlan['name']; ?>',
          extraUsers: 0,
          extraSKUs: 0,
          extraBrands: 0,
          totalUsers: <?php echo $selectedPlan['totalUsers']; ?>,
          totalSKUs: <?php echo $selectedPlan['totalSKUs']; ?>,
          totalBrands: <?php echo $selectedPlan['totalBrands']; ?>
        };

        try {
          const res = await fetch("http://localhost:8000/auth/checkout-register", {
            method: "POST",
            headers: {
              "Content-Type": "application/json"
            },
            body: JSON.stringify(payload)
          });

          if (!res.ok) {
            const errData = await res.json().catch(() => ({}));
            throw new Error(errData.detail || "Registration failed");
          }

          window.location.href = `http://localhost:3000/vendor/login?email=${encodeURIComponent(payload.email)}`;
        } catch (err) {
          console.error("Checkout registration failed:", err);
          alert("Registration failed: " + err.message);
          submitBtn.disabled = false;
          submitBtn.textContent = '<?php echo $selectedPlan['basePrice'] > 0 ? 'Complete Payment & Register' : 'Activate Free Trial'; ?>';
        }
      });
    });
  </script>
</body>
</html>
