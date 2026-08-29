<?php
$currentPage = 'home';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" href="assets/images/favicon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="description" content="Authentiq helps brand owners protect their products and their customers' trust. Put a verification QR on your packaging so anyone can scan, check the evidence, and get a confidence-scored authenticity result.">
  <meta property="og:title" content="Authentiq Scan. Verify. Trust.">
  <meta property="og:description" content="A simple, evidence-based way for your customers to verify what they buy and for your team to spot suspicious activity early.">
  <meta property="og:type" content="website">
  
  <title>Authentiq Scan. Verify. Trust.</title>

  <!-- Tailwind CSS Play CDN -->
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ['Manrope', 'sans-serif'],
            display: ['Sora', 'sans-serif'],
          },
          animation: {
            'infinite-scroll': 'infinite-scroll 25s linear infinite',
            'orb-drift-1': 'orb-drift-1 12s ease-in-out infinite',
            'orb-drift-2': 'orb-drift-2 16s ease-in-out infinite',
            'orb-drift-3': 'orb-drift-3 20s ease-in-out infinite',
            'shimmer-sweep': 'shimmer-sweep 5s linear infinite',
            'glow-pulse': 'glow-pulse 4s ease-in-out infinite',
          },
          keyframes: {
            'infinite-scroll': {
              from: { transform: 'translateX(-50%)' },
              to: { transform: 'translateX(0)' },
            },
            'orb-drift-1': {
              '0%, 100%': { transform: 'translate(0px, 0px) scale(1)', opacity: '0.55' },
              '33%':       { transform: 'translate(30px, -25px) scale(1.12)', opacity: '0.7' },
              '66%':       { transform: 'translate(-18px, 18px) scale(0.92)', opacity: '0.45' },
            },
            'orb-drift-2': {
              '0%, 100%': { transform: 'translate(0px, 0px) scale(1)', opacity: '0.45' },
              '40%':       { transform: 'translate(-35px, 20px) scale(1.1)', opacity: '0.65' },
              '70%':       { transform: 'translate(22px, -30px) scale(0.88)', opacity: '0.38' },
            },
            'orb-drift-3': {
              '0%, 100%': { transform: 'translate(0px, 0px) scale(1)', opacity: '0.35' },
              '50%':       { transform: 'translate(20px, 25px) scale(1.15)', opacity: '0.55' },
            },
            'shimmer-sweep': {
              '0%':   { transform: 'translateX(-100%) rotate(25deg)' },
              '100%': { transform: 'translateX(300%) rotate(25deg)' },
            },
            'glow-pulse': {
              '0%, 100%': { opacity: '0.18', transform: 'scale(1)' },
              '50%':       { opacity: '0.32', transform: 'scale(1.08)' },
            },
          }
        }
      }
    }
  </script>

  <!-- Custom CSS Styles -->
  <link rel="stylesheet" href="assets/css/styles.css">
</head>
<body class="min-h-screen bg-white text-[#38434f] antialiased selection:bg-[#16B981] selection:text-white">

  <!-- Header / Navbar Include -->
  <?php include 'components/navbar.php'; ?>

  <!-- Mobile Side Drawer Include -->
  <?php include 'components/sidedrawer.php'; ?>

  <main class="w-full">
    <!-- ===== HERO ===== -->
    <section id="home" class="relative overflow-hidden bg-gradient-to-b from-[#f4faf8] to-[#ffffff] via-[#f4faf8]">
      <div class="max-w-7xl mx-auto px-6 pt-[120px] sm:pt-[150px] pb-24 grid grid-cols-1 lg:grid-cols-[1.05fr_0.95fr] gap-14 items-center">
        
        <!-- Left Hero Content -->
        <div data-reveal class="max-w-2xl text-left">
          <h1 class="text-[40px] sm:text-[48px] md:text-[54px] leading-[1.06] font-extrabold tracking-tight text-[#0F2A43] mt-5 font-display">
            Give your customers a simple way to <span class="text-[#0E7C7B]">trust</span> what they buy.
          </h1>
          <p class="text-[18px] sm:text-[19px] leading-[1.6] text-[#51606d] mt-5 max-w-[520px]">
            Put an Authentiq QR on your packaging. Anyone can scan it, check the product's details and evidence, and get a clear confidence score so your brand and your customers stay a step ahead.
          </p>
          <div class="flex flex-wrap gap-3.5 mt-8">
            <a href="billing.php" class="bg-[#16B981] text-white font-bold text-[17px] px-7 py-3.5 rounded-[12px] shadow-[0_10px_24px_rgba(22,185,129,0.32)] hover:scale-105 transition-transform text-center inline-block">
              Start Free Trial
            </a>
            <a href="#how" class="bg-white text-[#0F2A43] font-bold text-[17px] px-6 py-3.5 rounded-[12px] border-[1.5px] border-[#d9e0e4] hover:bg-slate-50 transition-colors text-center inline-block">
              See how it works
            </a>
          </div>
          <p class="text-[14px] text-[#7a8792] mt-4 font-medium">14-day free trial · No card required</p>
        </div>

        <!-- Right Hero Mockup (Dynamic Scan Animation) -->
        <div data-reveal class="flex justify-center lg:justify-end">
          <div class="relative w-[300px] max-w-[82vw]">
            <!-- Background Glow -->
            <div class="absolute inset-[-8%_-6%] bg-[radial-gradient(circle_at_50%_42%,rgba(22,185,129,0.22),transparent_62%)] blur-[6px] z-0"></div>
            
            <!-- Mobile Shell -->
            <div class="relative z-10 bg-[#0F2A43] rounded-[42px] p-3 shadow-[0_40px_80px_rgba(15,42,67,0.28)]">
              <div class="bg-[#f4faf8] rounded-[32px] overflow-hidden relative">
                <!-- Speaker Notch -->
                <div class="absolute top-[12px] left-1/2 -translate-x-1/2 w-[90px] h-[20px] bg-[#0F2A43] rounded-full z-20"></div>
                
                <!-- Viewport Camera Scan -->
                <div class="relative h-[196px] bg-[#0F2A43] overflow-hidden">
                  <div class="absolute inset-0 opacity-[0.35]" style="background-image: linear-gradient(#12405f 1px,transparent 1px),linear-gradient(90deg,#12405f 1px,transparent 1px); background-size: 26px 26px;"></div>
                  
                  <!-- Package/QR Mockup -->
                  <div class="absolute top-[34px] left-1/2 -translate-x-1/2 w-[96px] h-[128px] bg-gradient-to-br from-white to-[#e8eef1] rounded-[10px] shadow-[0_12px_26px_rgba(0,0,0,0.35)]">
                    <div class="h-[40px] bg-[#16B981] rounded-t-[10px]"></div>
                    <div class="p-3">
                      <div class="h-[6px] w-[70%] bg-[#0F2A43] rounded-[3px]"></div>
                      <div class="h-[5px] w-[50%] bg-[#c3ccd2] rounded-[3px] mt-[7px]"></div>
                      <div class="mt-[16px] w-[40px] h-[40px] bg-[#0F2A43] rounded-[6px]"></div>
                    </div>
                  </div>
                  
                  <!-- Target Corners -->
                  <div class="absolute top-[26px] left-[26px] w-[26px] h-[26px] border-t-[3px] border-l-[3px] border-[#4fd6a6] rounded-tl-[6px]"></div>
                  <div class="absolute top-[26px] right-[26px] w-[26px] h-[26px] border-t-[3px] border-r-[3px] border-[#4fd6a6] rounded-tr-[6px]"></div>
                  <div class="absolute bottom-[26px] left-[26px] w-[26px] h-[26px] border-b-[3px] border-l-[3px] border-[#4fd6a6] rounded-bl-[6px]"></div>
                  <div class="absolute bottom-[26px] right-[26px] w-[26px] h-[26px] border-b-[3px] border-r-[3px] border-[#4fd6a6] rounded-br-[6px]"></div>
                  
                  <!-- Animated Scan Line -->
                  <div class="absolute left-[26px] right-[26px] h-[2px] bg-gradient-to-r from-transparent via-[#4fd6a6] to-transparent shadow-[0_0_12px_#4fd6a6]" style="animation: aq-scan 3.2s ease-in-out infinite;"></div>
                </div>
                
                <!-- Verification Screen Details -->
                <div class="p-[20px_18px_24px] text-left">
                  <div class="flex items-center gap-[13px]">
                    <div class="relative w-[62px] h-[62px] rounded-full shrink-0 flex items-center justify-center" style="background: conic-gradient(#16B981 0 88%, #dfe7ea 88% 100%);">
                      <div class="w-[48px] h-[48px] rounded-full bg-white flex flex-col items-center justify-center">
                        <span class="font-display font-extrabold text-[18px] text-[#0F2A43] leading-none">88</span>
                        <span class="text-[8px] text-[#8b97a1] font-semibold mt-[2px]">/100</span>
                      </div>
                    </div>
                    <div>
                      <div class="font-display font-bold text-[15px] text-[#0F2A43]">High confidence</div>
                      <div class="text-[12px] text-[#7a8792] mt-[2px] font-medium">Evidence checked</div>
                    </div>
                  </div>
                  <div class="mt-4 bg-[#e6f6ef] rounded-[12px] p-3 flex gap-2.5 items-start">
                    <span class="text-[#0E7C7B] shrink-0 mt-0.5">
                      <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                        <polyline points="22 4 12 14.01 9 11.01"></polyline>
                      </svg>
                    </span>
                    <span class="text-[12.5px] leading-[1.45] text-[#20604f] font-medium font-sans">Recommended next step: details match. Keep your receipt.</span>
                  </div>
                  <button class="mt-3.5 w-full bg-white border-[1.5px] border-[#e0e6e9] text-[#516170] rounded-[10px] p-[11px] text-[13px] font-bold hover:bg-slate-50 transition-colors">
                    Report something suspicious
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </section>

    <!-- ===== INDUSTRIES STRIP ===== -->
    <section class="border-t border-[#eef0f2] bg-[#fbfcfc]">
      <div class="max-w-[1100px] mx-auto py-10 px-6 text-center">
        <p class="text-[14px] font-semibold tracking-wider uppercase text-[#8b97a1]">Built for brands across</p>
        <div class="flex flex-wrap justify-center gap-3 mt-4">
          <?php 
          $industries = ['FMCG', 'Pharma', 'Agro', 'Liquor', 'Electronics', 'Manufacturing'];
          foreach ($industries as $ind): ?>
            <span class="font-display font-semibold text-[16px] text-[#516170] bg-white border border-[#e6eaed] px-4 py-2 rounded-full"><?php echo $ind; ?></span>
          <?php endforeach; ?>
        </div>
        <p class="text-[13px] text-[#a3adb5] mt-6 font-medium">Trusted by brands like these yours could be next.</p>
      </div>
    </section>

    <!-- ===== TRUST STRIP ===== -->
    <section class="border-b border-[#eef0f2] bg-[#f4f6f8] py-6">
      <!-- Brand logos row (Animated Marquee) -->
      <div class="relative w-full overflow-hidden [mask-image:_linear-gradient(to_right,transparent_0,_black_128px,_black_calc(100%-128px),transparent_100%)]">
        <div class="flex items-center gap-6 w-max animate-infinite-scroll">
            <?php for($i=0; $i<4; $i++): ?>
            <!-- Group -->
            <div class="flex items-center gap-6">

          <!-- Bikaji -->
          <div class="flex items-center justify-center h-[52px] px-5 bg-white border border-[#e6eaed] rounded-[10px] shadow-[0_1px_4px_rgba(15,42,67,0.06)] grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300" title="Bikaji Foods International">
            <svg width="90" height="28" viewBox="0 0 120 36" fill="none" xmlns="http://www.w3.org/2000/svg">
              <!-- Bikaji: red-orange brand wordmark recreation -->
              <rect x="0" y="4" width="28" height="28" rx="5" fill="#C8102E"/>
              <path d="M6 10 L10 10 Q14 10 14 14 Q14 17 10.5 17.5 Q15 18 15 22 Q15 26 10 26 L6 26 Z" fill="white" stroke="none"/>
              <rect x="5.5" y="9.5" width="4" height="7" rx="0" fill="white"/>
              <rect x="5.5" y="17" width="4.5" height="7.5" rx="0" fill="white"/>
              <text x="33" y="27" font-family="Georgia, serif" font-weight="900" font-size="17" fill="#C8102E" letter-spacing="0.5">BIKAJI</text>
              <path d="M33 30 L113 30" stroke="#f4a828" stroke-width="2.5" stroke-linecap="round"/>
            </svg>
          </div>

          <!-- Dabur -->
          <div class="flex items-center justify-center h-[52px] px-5 bg-white border border-[#e6eaed] rounded-[10px] shadow-[0_1px_4px_rgba(15,42,67,0.06)] grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300" title="Dabur India">
            <svg width="80" height="26" viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="2" width="28" height="28" rx="14" fill="#006633"/>
              <path d="M8 8 Q20 8 20 16 Q20 24 8 24 L8 8 Z" fill="white"/>
              <text x="34" y="23" font-family="Arial, sans-serif" font-weight="800" font-size="16" fill="#006633" letter-spacing="1">DABUR</text>
            </svg>
          </div>

          <!-- Haldirams -->
          <div class="flex items-center justify-center h-[52px] px-5 bg-white border border-[#e6eaed] rounded-[10px] shadow-[0_1px_4px_rgba(15,42,67,0.06)] grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300" title="Haldiram's">
            <svg width="100" height="26" viewBox="0 0 130 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 28 L4 8 L10 8 L10 16 L18 16 L18 8 L24 8 L24 28 L18 28 L18 20 L10 20 L10 28 Z" fill="#D4380D"/>
              <text x="30" y="23" font-family="Arial, sans-serif" font-weight="700" font-size="13" fill="#D4380D" letter-spacing="0.3">HALDIRAM'S</text>
            </svg>
          </div>

          <!-- Tata -->
          <div class="flex items-center justify-center h-[52px] px-5 bg-white border border-[#e6eaed] rounded-[10px] shadow-[0_1px_4px_rgba(15,42,67,0.06)] grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300" title="Tata">
            <svg width="80" height="26" viewBox="0 0 90 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <rect x="0" y="6" width="30" height="6" rx="3" fill="#00529B"/>
              <rect x="12" y="6" width="6" height="22" rx="2" fill="#00529B"/>
              <text x="40" y="23" font-family="Arial, sans-serif" font-weight="800" font-size="16" fill="#00529B" letter-spacing="1.5">TATA</text>
            </svg>
          </div>

          <!-- ITC -->
          <div class="flex items-center justify-center h-[52px] px-5 bg-white border border-[#e6eaed] rounded-[10px] shadow-[0_1px_4px_rgba(15,42,67,0.06)] grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300" title="ITC Limited">
            <svg width="60" height="26" viewBox="0 0 70 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <text x="4" y="24" font-family="Arial, sans-serif" font-weight="900" font-size="24" fill="#1B1464" letter-spacing="2">ITC</text>
            </svg>
          </div>

          <!-- Marico -->
          <div class="flex items-center justify-center h-[52px] px-5 bg-white border border-[#e6eaed] rounded-[10px] shadow-[0_1px_4px_rgba(15,42,67,0.06)] grayscale opacity-70 hover:grayscale-0 hover:opacity-100 transition-all duration-300" title="Marico">
            <svg width="88" height="26" viewBox="0 0 100 32" fill="none" xmlns="http://www.w3.org/2000/svg">
              <circle cx="10" cy="16" r="8" fill="#E8004A"/>
              <text x="24" y="22" font-family="Arial, sans-serif" font-weight="700" font-size="15" fill="#E8004A" letter-spacing="0.5">MARICO</text>
            </svg>
          </div>
            </div>
            <?php endfor; ?>
          </div>
        </div>

    </section>

    <!-- ===== THE PROBLEM ===== -->
    <section class="max-w-7xl mx-auto px-6 py-[90px] text-left">
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-12 items-center">
        <div data-reveal class="max-w-[550px]">
          <p class="font-display font-bold text-[14px] tracking-[0.08em] uppercase text-[#16B981]">The problem</p>
          <h2 class="text-[34px] sm:text-[38px] leading-[1.12] font-extrabold tracking-tight text-[#0F2A43] mt-3.5 font-display">When a product leaves your line, your brand is on its own.</h2>
          <p class="text-[18px] leading-[1.65] text-[#51606d] mt-8 max-w-[420px]">Products get copied, refilled, and relabelled<br>with fake batch or price details. Customers<br>can't easily tell what's real. And you often<br>hear about it far too late.</p>
        </div>
        <div data-reveal class="relative hidden lg:block rounded-[20px] overflow-hidden shadow-xl h-[280px]">
           <img src="assets/images/problem_warehouse.png" alt="Warehouse and logistics" class="w-full h-full object-cover">
           <div class="absolute inset-0 bg-gradient-to-tr from-[#0F2A43]/40 to-transparent"></div>
        </div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-11">
        <!-- Problem 1 -->
        <div data-reveal class="bg-[#fbfcfc] border border-[#eef0f2] rounded-[16px] p-7 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
          <div class="flex items-center gap-3">
            <div class="w-[46px] h-[46px] rounded-[12px] bg-[#fef1ee] flex items-center justify-center text-[#e07a55] shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M8 3H5a2 2 0 0 0-2 2v3"></path>
                <path d="M16 3h3a2 2 0 0 1 2 2v3"></path>
                <path d="M8 21H5a2 2 0 0 1-2-2v-3"></path>
                <path d="M16 21h3a2 2 0 0 0 2-2v-3"></path>
                <path d="M9 12l2 2 4-4"></path>
              </svg>
            </div>
            <h3 class="text-[19px] font-bold text-[#0F2A43] font-display">Copies slip through</h3>
          </div>
          <p class="text-[15.5px] leading-[1.6] text-[#5c6a76] mt-3.5 font-medium font-sans">Look-alike products and refilled packs reach shelves alongside your genuine goods.</p>
        </div>

        <!-- Problem 2 -->
        <div data-reveal class="bg-[#fbfcfc] border border-[#eef0f2] rounded-[16px] p-7 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
          <div class="flex items-center gap-3">
            <div class="w-[46px] h-[46px] rounded-[12px] bg-[#fef1ee] flex items-center justify-center text-[#e07a55] shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="2" x2="12" y2="22"></line>
                <line x1="2" y1="12" x2="22" y2="12"></line>
              </svg>
            </div>
            <h3 class="text-[19px] font-bold text-[#0F2A43] font-display">Fake batch & price</h3>
          </div>
          <p class="text-[15.5px] leading-[1.6] text-[#5c6a76] mt-3.5 font-medium font-sans">Labels get swapped with wrong<br>batch numbers, dates, or MRP<br>and customers can’t tell.</p>
        </div>

        <!-- Problem 3 -->
        <div data-reveal class="bg-[#fbfcfc] border border-[#eef0f2] rounded-[16px] p-7 transition-all duration-300 hover:shadow-lg hover:-translate-y-1">
          <div class="flex items-center gap-3">
            <div class="w-[46px] h-[46px] rounded-[12px] bg-[#fef1ee] flex items-center justify-center text-[#e07a55] shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="12" y1="9" x2="12" y2="13"></line>
                <line x1="12" y1="17" x2="12.01" y2="17"></line>
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path>
              </svg>
            </div>
            <h3 class="text-[19px] font-bold text-[#0F2A43] font-display">You hear too late</h3>
          </div>
          <p class="text-[15.5px] leading-[1.6] text-[#5c6a76] mt-3.5 font-medium font-sans">Without early signals, problems spread for months before your team finds out.</p>
        </div>
      </div>
    </section>

    <!-- ===== HOW IT WORKS ===== -->
    <section id="how" class="bg-[#0F2A43] text-white text-left scroll-mt-24">
      <div class="max-w-7xl mx-auto px-6 py-[92px]">
        <div data-reveal class="text-center max-w-[640px] mx-auto">
          <p class="font-display font-bold text-[14px] tracking-[0.08em] uppercase text-[#4fd6a6]">How it works</p>
          <h2 class="text-[34px] sm:text-[40px] leading-[1.1] font-extrabold tracking-tight text-white mt-3.5 font-display">Three simple steps to a more trusted brand.</h2>
          <div class="inline-flex items-center gap-3.5 mt-5 font-display font-bold text-[16px] text-[#8fb0c9]">
            <span class="text-[#4fd6a6]">Scan</span><span class="opacity-40">→</span><span class="text-[#4fd6a6]">Verify</span><span class="opacity-40">→</span><span class="text-[#4fd6a6]">Trust</span>
          </div>
        </div>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6 mt-12">
          <!-- Step 1 -->
          <div data-reveal class="bg-white/5 border border-white/10 rounded-[18px] p-8 hover:bg-white/10 transition-colors duration-300">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="font-display font-extrabold text-[18px] text-[#0F2A43] bg-[#4fd6a6] w-[40px] h-[40px] rounded-[12px] flex items-center justify-center shrink-0">1</span>
                <h3 class="text-[21px] font-bold text-white font-display leading-tight">Register & tag</h3>
              </div>
              <span class="text-[#4fd6a6] shrink-0 ml-3">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 7V5a2 2 0 0 1 2-2h2"></path>
                  <path d="M16 3h2a2 2 0 0 1 2 2v2"></path>
                  <path d="M20 17v2a2 2 0 0 1-2 2h-2"></path>
                  <path d="M8 21H6a2 2 0 0 1-2-2v-2"></path>
                  <line x1="7" y1="12" x2="17" y2="12"></line>
                </svg>
              </span>
            </div>
            <p class="text-[15.5px] leading-[1.62] text-[#b6c6d4] mt-5 font-medium font-sans">Register your brand and products, then put an Authentiq QR on your packaging.</p>
          </div>

          <!-- Step 2 -->
          <div data-reveal class="bg-white/5 border border-white/10 rounded-[18px] p-8 hover:bg-white/10 transition-colors duration-300">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="font-display font-extrabold text-[18px] text-[#0F2A43] bg-[#4fd6a6] w-[40px] h-[40px] rounded-[12px] flex items-center justify-center shrink-0">2</span>
                <h3 class="text-[21px] font-bold text-white font-display leading-tight">Customers scan</h3>
              </div>
              <span class="text-[#4fd6a6] shrink-0 ml-3">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M3 7V5a2 2 0 0 1 2-2h2"></path>
                  <path d="M17 3h2a2 2 0 0 1 2 2v2"></path>
                  <path d="M21 17v2a2 2 0 0 1-2 2h-2"></path>
                  <path d="M7 21H5a2 2 0 0 1-2-2v-2"></path>
                  <rect x="7" y="8" width="4" height="4"></rect>
                  <line x1="15" y1="8" x2="17" y2="8"></line>
                  <line x1="15" y1="12" x2="17" y2="12"></line>
                  <line x1="13" y1="15" x2="17" y2="15"></line>
                </svg>
              </span>
            </div>
            <p class="text-[15.5px] leading-[1.62] text-[#b6c6d4] mt-5 font-medium font-sans">A customer or your vigilance team scans the QR and adds a few product photos no app or account needed for a basic check.</p>
          </div>

          <!-- Step 3 -->
          <div data-reveal class="bg-white/5 border border-white/10 rounded-[18px] p-8 hover:bg-white/10 transition-colors duration-300">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-3">
                <span class="font-display font-extrabold text-[18px] text-[#0F2A43] bg-[#4fd6a6] w-[40px] h-[40px] rounded-[12px] flex items-center justify-center shrink-0">3</span>
                <h3 class="text-[21px] font-bold text-white font-display leading-tight">Verify & act</h3>
              </div>
              <span class="text-[#4fd6a6] shrink-0 ml-3">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M9 12l2 2 4-4"></path>
                  <circle cx="12" cy="12" r="9"></circle>
                </svg>
              </span>
            </div>
            <p class="text-[15.5px] leading-[1.62] text-[#b6c6d4] mt-5 font-medium font-sans">They get a clear confidence score and a recommended next step, and can report anything suspicious. You see the signals.</p>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== FEATURES ===== -->
    <section id="features" class="max-w-7xl mx-auto px-6 py-[92px] text-left">
      <div data-reveal class="text-center max-w-[800px] mx-auto">
        <p class="font-display font-bold text-[14px] tracking-[0.08em] uppercase text-[#16B981]">Features</p>
        <h2 class="text-[34px] sm:text-[40px] leading-[1.1] font-extrabold tracking-tight text-[#0F2A43] mt-3.5 font-display md:whitespace-nowrap">Everything you need to protect your brand.</h2>
        <p class="text-[18px] leading-[1.6] text-[#51606d] mt-4 font-medium max-w-[640px] mx-auto">Built around trust and evidence simple for your customers,<br>powerful for your team.</p>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mt-12">

        <!-- Feature 1 -->
        <div data-reveal class="bg-white border border-[#eaedef] rounded-[18px] p-8 shadow-[0_1px_3px_rgba(15,42,67,0.04)] hover:shadow-[0_16px_40px_rgba(15,42,67,0.10)] hover:-translate-y-[3px] transition-all duration-300">
          <div class="w-[50px] h-[50px] rounded-[14px] bg-[#e6f6ef] flex items-center justify-center text-[#0E7C7B]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M9 12l2 2 4-4"></path>
              <circle cx="12" cy="12" r="9"></circle>
            </svg>
          </div>
          <h3 class="text-[19px] font-bold text-[#0F2A43] mt-5 font-display">Evidence-based verification</h3>
          <p class="text-[15.5px] leading-[1.62] text-[#5c6a76] mt-2.5 font-medium font-sans">Every check weighs the product's details and the evidence provided, then returns a clear confidence score.</p>
        </div>

        <!-- Feature 2 -->
        <div data-reveal class="bg-white border border-[#eaedef] rounded-[18px] p-8 shadow-[0_1px_3px_rgba(15,42,67,0.04)] hover:shadow-[0_16px_40px_rgba(15,42,67,0.10)] hover:-translate-y-[3px] transition-all duration-300">
          <div class="w-[50px] h-[50px] rounded-[14px] bg-[#e6f6ef] flex items-center justify-center text-[#0E7C7B]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6l8-4z"></path>
              <path d="M9 12l2 2 4-4"></path>
            </svg>
          </div>
          <h3 class="text-[19px] font-bold text-[#0F2A43] mt-5 font-display">Report straight to you</h3>
          <p class="text-[15.5px] leading-[1.62] text-[#5c6a76] mt-2.5 font-medium font-sans">Customers and vigilance staff can flag anything suspicious, and the report lands with your team right away.</p>
        </div>

        <!-- Feature 3 -->
        <div data-reveal class="bg-white border border-[#eaedef] rounded-[18px] p-8 shadow-[0_1px_3px_rgba(15,42,67,0.04)] hover:shadow-[0_16px_40px_rgba(15,42,67,0.10)] hover:-translate-y-[3px] transition-all duration-300">
          <div class="w-[50px] h-[50px] rounded-[14px] bg-[#e6f6ef] flex items-center justify-center text-[#0E7C7B]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 3v18h18"></path>
              <polyline points="7 14 10 11 13 14 18 8"></polyline>
            </svg>
          </div>
          <h3 class="text-[19px] font-bold text-[#0F2A43] mt-5 font-display">Early fraud & location signals</h3>
          <p class="text-[15.5px] leading-[1.62] text-[#5c6a76] mt-2.5 font-medium font-sans">Spot suspicious activity by area with aggregate, privacy-respecting signals no tracking of individual people.</p>
        </div>

        <!-- Feature 4 -->
        <div data-reveal class="bg-white border border-[#eaedef] rounded-[18px] p-8 shadow-[0_1px_3px_rgba(15,42,67,0.04)] hover:shadow-[0_16px_40px_rgba(15,42,67,0.10)] hover:-translate-y-[3px] transition-all duration-300">
          <div class="w-[50px] h-[50px] rounded-[14px] bg-[#e6f6ef] flex items-center justify-center text-[#0E7C7B]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="3" width="7" height="7"></rect>
              <rect x="14" y="3" width="7" height="7"></rect>
              <rect x="14" y="14" width="7" height="7"></rect>
              <rect x="3" y="14" width="7" height="7"></rect>
            </svg>
          </div>
          <h3 class="text-[19px] font-bold text-[#0F2A43] mt-5 font-display">Many brands, one place</h3>
          <p class="text-[15.5px] leading-[1.62] text-[#5c6a76] mt-2.5 font-medium font-sans">Manage multiple brands, products, and batches from a single, organised workspace.</p>
        </div>

        <!-- Feature 5 -->
        <div data-reveal class="bg-white border border-[#eaedef] rounded-[18px] p-8 shadow-[0_1px_3px_rgba(15,42,67,0.04)] hover:shadow-[0_16px_40px_rgba(15,42,67,0.10)] hover:-translate-y-[3px] transition-all duration-300">
          <div class="w-[50px] h-[50px] rounded-[14px] bg-[#e6f6ef] flex items-center justify-center text-[#0E7C7B]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="7" y="8" width="4" height="4"></rect>
              <rect x="4" y="4" width="6" height="6"></rect>
              <rect x="14" y="4" width="6" height="6"></rect>
              <rect x="14" y="14" width="6" height="6"></rect>
              <rect x="4" y="14" width="6" height="6"></rect>
            </svg>
          </div>
          <h3 class="text-[19px] font-bold text-[#0F2A43] mt-5 font-display">Bulk QR for your lines</h3>
          <p class="text-[15.5px] leading-[1.62] text-[#5c6a76] mt-2.5 font-medium font-sans">Generate QR codes in bulk so your packaging lines keep moving without slowing down.</p>
        </div>

        <!-- Feature 6 -->
        <div data-reveal class="bg-white border border-[#eaedef] rounded-[18px] p-8 shadow-[0_1px_3px_rgba(15,42,67,0.04)] hover:shadow-[0_16px_40px_rgba(15,42,67,0.10)] hover:-translate-y-[3px] transition-all duration-300">
          <div class="w-[50px] h-[50px] rounded-[14px] bg-[#e6f6ef] flex items-center justify-center text-[#0E7C7B]">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M8 3H7a4 4 0 0 0-4 4v1"></path>
              <path d="M16 3h1a4 4 0 0 1 4 4v1"></path>
              <path d="M8 21H7a4 4 0 0 1-4-4v-1"></path>
              <path d="M16 21h1a4 4 0 0 0 4-4v-1"></path>
              <line x1="9" y1="12" x2="15" y2="12"></line>
            </svg>
          </div>
          <h3 class="text-[19px] font-bold text-[#0F2A43] mt-5 font-display">Connect your systems</h3>
          <p class="text-[15.5px] leading-[1.62] text-[#5c6a76] mt-2.5 font-medium font-sans">Fits alongside the tools you already use,<br>so trust data flows where your<br>business needs it.</p>
        </div>

      </div>
    </section>

    <!-- ===== BRAND / CUSTOMER SPLIT ===== -->
    <section class="bg-[#fbfcfc] border-y border-[#eef0f2] text-left">
      <div class="max-w-7xl mx-auto px-6 py-[88px] grid grid-cols-1 md:grid-cols-2 gap-7">
        <!-- Brand Benefits -->
        <div data-reveal class="bg-white border border-[#eaedef] rounded-[20px] p-8 sm:p-10 shadow-sm">
          <div class="inline-flex items-center gap-2 bg-[#eaf2f8] text-[#0F2A43] font-bold text-[13px] px-3.5 py-1.5 rounded-full font-sans">For brand owners</div>
          <h3 class="text-[26px] font-extrabold tracking-tight text-[#0F2A43] mt-5 font-display">Protection and clear visibility.</h3>
          <div class="flex flex-col gap-4 mt-5.5 mt-5">
            <?php 
            $brandBenefits = [
              'Protect your brand from copies, refills, and relabelled packs.',
              'See suspicious-activity signals by area, early enough to act.',
              'Receive reports from customers and your vigilance team in one place.',
              'Build lasting trust with the people who buy from you.'
            ];
            foreach ($brandBenefits as $b): ?>
              <div class="flex gap-3 items-start">
                <span class="shrink-0 mt-0.5 text-[#16B981]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
                <p class="text-[16px] leading-[1.55] text-[#42505c] font-medium font-sans"><?php echo $b; ?></p>
              </div>
            <?php endforeach; ?>
          </div>
        </div>

        <!-- Customer Benefits -->
        <div data-reveal class="bg-[#0F2A43] rounded-[20px] p-8 sm:p-10 text-white shadow-xl">
          <div class="inline-flex items-center gap-2 bg-[#4fd6a6]/20 text-[#4fd6a6] font-bold text-[13px] px-3.5 py-1.5 rounded-full font-sans">For your customers</div>
          <h3 class="text-[26px] font-extrabold tracking-tight text-white mt-5 font-display">A reassuring check in seconds.</h3>
          <div class="flex flex-col gap-4 mt-5">
            <?php 
            $customerBenefits = [
              'Check a product in seconds by scanning the QR on the pack.',
              'No app to download and no account needed for a basic check.',
              'Get a clear confidence score and a recommended next step.',
              'Report anything that looks off, directly to the brand.'
            ];
            foreach ($customerBenefits as $b): ?>
              <div class="flex gap-3 items-start">
                <span class="shrink-0 mt-0.5 text-[#4fd6a6]">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                </span>
                <p class="text-[16px] leading-[1.55] text-[#c3d1dd] font-medium font-sans"><?php echo $b; ?></p>
              </div>
            <?php endforeach; ?>
          </div>
        </div>
      </div>
    </section>

    <!-- ===== PRICING ===== -->
    <section id="pricing" class="max-w-[1400px] mx-auto px-4 py-[92px] text-left">
      <div data-reveal class="text-center max-w-[640px] mx-auto">
        <p class="font-display font-bold text-[14px] tracking-[0.08em] uppercase text-[#16B981]">Pricing</p>
        <h2 class="text-[34px] sm:text-[40px] leading-[1.1] font-extrabold tracking-tight text-[#0F2A43] mt-3.5 font-display">Simple plans. Unlimited verifications.</h2>
        <p class="text-[18px] leading-[1.6] text-[#51606d] mt-4 font-medium">Billed annually, in INR. Prices shown are exclusive of GST.</p>
      </div>

      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mt-14 items-stretch">
        
        <!-- Free Trial -->
        <div data-reveal class="bg-white border border-[#e6eaed] rounded-[24px] p-8 shadow-sm flex flex-col h-full relative">
          <div class="text-slate-500 text-[10px] font-bold tracking-wider uppercase mb-5 self-start">NO CREDIT CARD</div>
          <h3 class="text-[26px] text-[#0F2A43] mb-3 font-display">Free Trial</h3>
          <p class="text-[14px] text-[#516170] leading-[1.5] mb-6 min-h-[60px]">Try core features for 14 days without any commitment.</p>
          
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[24px] font-bold text-[#0F2A43] leading-none tracking-tight">₹0</span>
          </div>
          <div class="text-[11px] text-[#16B981] font-bold tracking-wide uppercase mt-2 opacity-0">Spacer</div>

          <div class="flex flex-col gap-5 mt-8">
            <div>
              <div class="text-[10px] uppercase text-[#8b97a1] font-bold tracking-wider mb-1.5">TEAM MEMBERS</div>
              <div class="text-[14px] text-[#0F2A43] font-bold">1 user</div>
            </div>
            <div>
              <div class="text-[10px] uppercase text-[#8b97a1] font-bold tracking-wider mb-1.5">SKUS COUNT</div>
              <div class="text-[14px] text-[#0F2A43] font-bold">1 SKU</div>
            </div>
            <div>
              <div class="text-[10px] uppercase text-[#8b97a1] font-bold tracking-wider mb-1.5">BRANDS REGISTRY</div>
              <div class="text-[14px] text-[#0F2A43] font-bold">1 brand</div>
            </div>
          </div>
          
          <a href="billing.php?plan=free" class="mt-auto pt-8 block">
            <button class="w-full bg-[#f4faf8] text-[#0E7C7B] text-center py-3.5 rounded-[12px] font-bold text-[14px] hover:bg-[#e6f6ef] transition-colors border border-[#d2efe2]">
              START FREE TRIAL
            </button>
          </a>
        </div>

        <!-- Business -->
        <div data-reveal class="bg-white border border-[#e6eaed] rounded-[24px] p-8 shadow-sm flex flex-col h-full relative">
          <div class="text-[#16B981] text-[10px] font-bold tracking-wider uppercase mb-5 self-start">FOR GROWING BRANDS</div>
          <h3 class="text-[26px] text-[#0F2A43] mb-3 font-display">Business</h3>
          <p class="text-[14px] text-[#516170] leading-[1.5] mb-6 min-h-[60px]">Scale production protection with dedicated location metrics.</p>
          
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[16px] text-[#8b97a1] line-through font-semibold">₹60,000</span>
            <span class="text-[24px] font-bold text-[#0F2A43] leading-none tracking-tight">₹ 55,000</span>
            <span class="text-[14px] text-[#8b97a1] font-semibold mb-1 self-end">/yr</span>
          </div>
          <div class="text-[11px] text-[#16B981] font-bold tracking-wide mt-2">+18% GST (regulatory charge)</div>

          <div class="flex flex-col gap-5 mt-8">
            <div>
              <div class="text-[10px] uppercase text-[#8b97a1] font-bold tracking-wider mb-1.5">TEAM MEMBERS (ADD-ONS)</div>
              <div class="text-[14px] text-[#0F2A43] font-bold">5 users</div>
            </div>
            <div>
              <div class="text-[10px] uppercase text-[#8b97a1] font-bold tracking-wider mb-1.5">SKUS COUNT LIMITS (ADD-ONS)</div>
              <div class="text-[14px] text-[#0F2A43] font-bold">25 SKUs</div>
            </div>
          </div>
          
          <a href="billing.php?plan=business" class="mt-auto pt-8 block">
            <button class="w-full bg-[#16B981] text-white text-center py-3.5 rounded-[12px] font-bold text-[14px] hover:bg-[#13a371] shadow-[0_8px_20px_rgba(22,185,129,0.25)] transition-colors">
              SELECT BUSINESS
            </button>
          </a>
        </div>

        <!-- Business Pro -->
        <div data-reveal class="bg-[#0b1622] border-2 border-[#16B981] rounded-[24px] p-8 shadow-[0_16px_40px_rgba(22,185,129,0.15)] flex flex-col h-full relative">
          <div class="text-[#16B981] text-[10px] font-bold tracking-wider uppercase mb-5 self-start">MOST POPULAR</div>
          <h3 class="text-[26px] text-white mb-3 font-display">Business Pro</h3>
          <p class="text-[14px] text-[#b6c6d4] leading-[1.5] mb-6 min-h-[60px]">Enterprise tracking, advanced heatmaps, and webhook integrations.</p>
          
          <div class="flex items-center gap-1.5 mb-1 whitespace-nowrap">
            <span class="text-[14px] text-[#8b97a1] line-through font-semibold">₹2,75,000</span>
            <span class="text-[24px] font-bold text-white leading-none tracking-tight">₹ 2,45,000</span>
            <span class="text-[13px] text-[#8b97a1] font-semibold mb-1 self-end">/yr</span>
          </div>
          <div class="text-[11px] text-[#16B981] font-bold tracking-wide mt-2">+18% GST (regulatory charge)</div>

          <div class="flex flex-col gap-5 mt-8">
            <div>
              <div class="text-[10px] uppercase text-[#8b97a1] font-bold tracking-wider mb-1.5">TEAM MEMBERS (ADD-ONS)</div>
              <div class="text-[14px] text-white font-bold">50 users</div>
            </div>
            <div>
              <div class="text-[10px] uppercase text-[#8b97a1] font-bold tracking-wider mb-1.5">SKUS COUNT LIMITS (ADD-ONS)</div>
              <div class="text-[14px] text-white font-bold">500 SKUs</div>
            </div>
            <div>
              <div class="text-[10px] uppercase text-[#8b97a1] font-bold tracking-wider mb-1.5">BRANDS REGISTRY (ADD-ONS)</div>
              <div class="text-[14px] text-white font-bold">5 brands</div>
            </div>
          </div>
          
          <a href="billing.php?plan=pro" class="mt-auto pt-8 block">
            <button class="w-full bg-[#16B981] text-white text-center py-3.5 rounded-[12px] font-bold text-[14px] hover:bg-[#13a371] shadow-[0_8px_24px_rgba(22,185,129,0.3)] transition-colors">
              SELECT BUSINESS PRO
            </button>
          </a>
        </div>

        <!-- Enterprise -->
        <div data-reveal class="bg-white border border-[#e6eaed] rounded-[24px] p-8 shadow-sm flex flex-col h-full relative">
          <div class="text-slate-500 text-[10px] font-bold tracking-wider uppercase mb-5 self-start">TAILORED SLA</div>
          <h3 class="text-[26px] text-[#0F2A43] mb-3 font-display">Enterprise</h3>
          <p class="text-[14px] text-[#516170] leading-[1.5] mb-6 min-h-[60px]">High volume operations requiring custom pipelines & SSO.</p>
          
          <div class="flex items-center gap-2 mb-1">
            <span class="text-[24px] font-bold text-[#0F2A43] leading-none tracking-tight">Custom</span>
          </div>
          <div class="text-[11px] text-white font-bold tracking-wide mt-2 opacity-0">Hidden spacer</div>

          <div class="flex flex-col gap-6 mt-8">
            <div class="flex items-center justify-between border-b border-gray-100 pb-3">
              <div class="text-[10px] uppercase text-[#8b97a1] font-bold tracking-wider">USERS LIMIT</div>
              <div class="text-[13px] text-[#16B981] font-bold">Unlimited</div>
            </div>
            <div class="flex items-center justify-between border-b border-gray-100 pb-3">
              <div class="text-[10px] uppercase text-[#8b97a1] font-bold tracking-wider">SKUS LIMIT</div>
              <div class="text-[13px] text-[#16B981] font-bold">Unlimited</div>
            </div>
          </div>
          
          <a href="contact.php" class="mt-auto pt-8 block">
            <button class="w-full bg-[#1b2a3d] text-white text-center py-3.5 rounded-[12px] font-bold text-[14px] hover:bg-[#111c2a] shadow-md transition-colors">
              CONTACT SALES
            </button>
          </a>
        </div>

      </div>
      <p class="text-center text-[15px] text-[#5c6a76] mt-12 font-medium">Need more brands, SKUs, or users? Add-ons are available on any paid plan.</p>
    </section>

    <!-- ===== FAQ ===== -->
    <section id="faq" class="bg-[#fbfcfc] border-t border-[#eef0f2] text-left">
      <div class="max-w-[820px] mx-auto px-6 py-[90px]">
        <div data-reveal class="text-center">
          <p class="font-display font-bold text-[20px] tracking-[0.08em] uppercase text-[#16B981]">FAQ</p>
          <h2 class="text-[34px] sm:text-[40px] leading-[1.1] font-extrabold tracking-tight text-[#0F2A43] mt-3.5 font-display">Questions, answered plainly.</h2>
        </div>
        <div class="mt-11 flex flex-col gap-3">
          <?php 
          $faqs = [
            [
              'q' => 'What is Authentiq, and who is it for?',
              'a' => 'Authentiq is a product trust platform for brand owners who sell physical packaged goods. It gives your customers and your vigilance team a simple way to check a product and see a confidence-scored result helping protect your brand and the people who buy from you.'
            ],
            [
              'q' => 'Do my customers need to download an app or create an account?',
              'a' => 'No. For a basic check, a customer simply scans the QR on the packaging with their phone camera no app to install and no account to create.'
            ],
            [
              'q' => 'How does a customer verify a product?',
              'a' => 'They scan the QR on the pack, add a few product photos, and receive a clear confidence score along with a recommended next step. It only takes a few moments.'
            ],
            [
              'q' => 'Does scanning the QR alone mean the product is genuine?',
              'a' => 'No. The QR is the starting point, not proof on its own. Verification weighs the product’s details and the evidence provided, then returns a confidence score and a recommended next step never a guarantee.'
            ],
            [
              'q' => 'What happens if something looks suspicious?',
              'a' => 'The customer or your team can report it to you directly. Your team sees the signal, so you can look into patterns and act early.'
            ],
            [
              'q' => 'Can I manage more than one brand or product?',
              'a' => 'Yes. You can manage multiple brands, products, and batches from one workspace, with plans that scale as you grow.'
            ],
            [
              'q' => 'Can Authentiq connect to our existing systems?',
              'a' => 'Yes. At a business level, Authentiq is built to fit alongside the tools you already use, so trust data reaches the right places in your organisation.'
            ]
          ];
          
          foreach ($faqs as $i => $fq): ?>
            <div data-reveal class="bg-white border border-[#eaedef] rounded-[14px] overflow-hidden transition-all duration-300">
              <button class="faq-btn w-full text-left px-6 py-5 flex items-center justify-between gap-4 focus:outline-none cursor-pointer">
                <span class="font-display font-bold text-[17.5px] text-[#0F2A43]"><?php echo $fq['q']; ?></span>
                <span class="faq-arrow flex shrink-0 text-[#16B981] transition-transform duration-200">
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round">
                    <polyline points="6 9 12 15 18 9"></polyline>
                  </svg>
                </span>
              </button>
              <div class="faq-panel transition-all duration-300 ease-in-out overflow-hidden max-h-0">
                <p class="px-6 pb-6 text-[16px] leading-[1.65] text-[#51606d] font-medium font-sans"><?php echo $fq['a']; ?></p>
              </div>
            </div>
          <?php endforeach; ?>
        </div>
      </div>
    </section>

    <!-- ===== FINAL CTA ===== -->
    <section class="max-w-7xl mx-auto px-6 py-[90px] text-center">
      <div data-reveal class="relative overflow-hidden bg-gradient-to-br from-[#071c38] via-[#0b5e5e] to-[#0a3d2a] rounded-[26px] p-12 sm:p-16 shadow-[0_32px_90px_rgba(14,124,123,0.45)]">

        <!-- ░░ LAYER 1: Canvas – particle network + QR scan beam ░░ -->
        <canvas id="cta-canvas" class="absolute inset-0 w-full h-full pointer-events-none" style="opacity:0.9;"></canvas>

        <!-- ░░ LAYER 2: Floating binary data columns ░░ -->
        <div class="absolute inset-0 overflow-hidden pointer-events-none select-none" aria-hidden="true" style="font-family:monospace;">
          <span class="absolute text-[11px] font-bold text-[#16B981] opacity-[0.13] animate-orb-drift-1" style="top:8%;left:5%;letter-spacing:2px;writing-mode:vertical-rl;line-height:1.6;animation-duration:18s;">10110100<br>01001011<br>11010110</span>
          <span class="absolute text-[11px] font-bold text-[#4fd6a6] opacity-[0.10] animate-orb-drift-2" style="top:15%;right:6%;letter-spacing:2px;writing-mode:vertical-rl;line-height:1.6;animation-duration:22s;">01101001<br>10010110<br>00110101</span>
          <span class="absolute text-[11px] font-bold text-[#16B981] opacity-[0.09] animate-orb-drift-3" style="bottom:12%;left:12%;letter-spacing:2px;writing-mode:vertical-rl;line-height:1.6;animation-duration:26s;">11001010<br>01011010</span>
          <span class="absolute text-[11px] font-bold text-[#7effd4] opacity-[0.08] animate-orb-drift-1" style="bottom:10%;right:14%;letter-spacing:2px;writing-mode:vertical-rl;line-height:1.6;animation-duration:20s;">10110010<br>11010001<br>01101100</span>
        </div>



        <!-- ░░ LAYER 4: Rotating dashed orbit ring ░░ -->
        <div class="absolute inset-0 flex items-center justify-center pointer-events-none">
          <div class="absolute w-[320px] h-[320px] rounded-full border border-dashed border-[#16B981]/15 animate-spin" style="animation-duration:28s;"></div>
          <div class="absolute w-[220px] h-[220px] rounded-full border border-dashed border-[#4fd6a6]/10 animate-spin" style="animation-duration:18s;animation-direction:reverse;"></div>
        </div>

        <!-- ░░ LAYER 5: Soft centre radial glow ░░ -->
        <div class="absolute inset-0 pointer-events-none" style="background: radial-gradient(ellipse 70% 55% at 50% 50%, rgba(22,185,129,0.12) 0%, transparent 70%);"></div>

        <!-- ░░ Content ░░ -->
        <div class="relative z-10">
          <h2 class="text-[32px] sm:text-[38px] leading-[1.12] font-extrabold tracking-tight text-white max-w-[640px] mx-auto font-display">Help every customer trust what they buy from you.</h2>
          <p class="text-[18px] text-[#cfe6e4] mt-4.5 max-w-[520px] mx-auto font-medium">Start your 14-day free trial today. No card required.</p>
          <div class="flex flex-wrap justify-center gap-3.5 mt-8">
            <a href="billing.php" class="bg-[#16B981] text-white font-bold text-[17px] px-7 py-3.5 rounded-[12px] shadow-[0_10px_28px_rgba(22,185,129,0.45)] hover:bg-[#13a371] hover:text-white hover:scale-105 transition-all duration-200 text-center inline-block">
              Start Free Trial
            </a>
            <a href="contact.php" class="bg-white/10 text-white font-bold text-[17px] px-7 py-3.5 rounded-[12px] border border-white/25 hover:bg-white/20 hover:text-white transition-colors duration-200 text-center inline-block">
              Talk to us
            </a>
          </div>
        </div>

        <!-- ░░ Canvas animation script ░░ -->
        <script>
        (function() {
          function initCTACanvas() {
            var canvas = document.getElementById('cta-canvas');
            if (!canvas) return;
            var ctx = canvas.getContext('2d');
            var W, H, pts, scanY, scanDir = 1, raf;

            function resize() {
              W = canvas.offsetWidth;
              H = canvas.offsetHeight;
              canvas.width  = W;
              canvas.height = H;
              build();
            }

            function build() {
              pts = [];
              var n = Math.min(55, Math.floor(W * H / 7000));
              for (var i = 0; i < n; i++) {
                pts.push({
                  x: Math.random() * W,
                  y: Math.random() * H,
                  vx: (Math.random() - 0.5) * 0.38,
                  vy: (Math.random() - 0.5) * 0.38,
                  r: Math.random() * 1.8 + 0.8,
                  glow: 0
                });
              }
              if (scanY === undefined) scanY = 0;
            }

            function tick() {
              ctx.clearRect(0, 0, W, H);

              /* ── scan beam ── */
              scanY += scanDir * 0.9;
              if (scanY > H + 30) scanDir = -1;
              if (scanY < -30)    scanDir =  1;

              /* beam glow band */
              var sg = ctx.createLinearGradient(0, scanY - 50, 0, scanY + 50);
              sg.addColorStop(0,   'transparent');
              sg.addColorStop(0.4, 'rgba(22,185,129,0.04)');
              sg.addColorStop(0.5, 'rgba(22,185,129,0.22)');
              sg.addColorStop(0.6, 'rgba(22,185,129,0.04)');
              sg.addColorStop(1,   'transparent');
              ctx.fillStyle = sg;
              ctx.fillRect(0, scanY - 50, W, 100);

              /* beam line */
              ctx.save();
              ctx.beginPath();
              ctx.moveTo(0, scanY);
              ctx.lineTo(W, scanY);
              ctx.strokeStyle = 'rgba(22,185,129,0.75)';
              ctx.lineWidth = 1.2;
              ctx.shadowBlur  = 14;
              ctx.shadowColor = '#16B981';
              ctx.stroke();
              ctx.restore();

              /* ── particles ── */
              for (var i = 0; i < pts.length; i++) {
                var p = pts[i];
                p.x += p.vx; p.y += p.vy;
                if (p.x < 0) p.x = W; if (p.x > W) p.x = 0;
                if (p.y < 0) p.y = H; if (p.y > H) p.y = 0;

                /* scan interaction */
                var dy = Math.abs(p.y - scanY);
                p.glow = dy < 35 ? (1 - dy / 35) : Math.max(0, p.glow - 0.025);

                /* connections */
                for (var j = i + 1; j < pts.length; j++) {
                  var q = pts[j];
                  var dx2 = p.x - q.x, dy2 = p.y - q.y;
                  var d = Math.sqrt(dx2 * dx2 + dy2 * dy2);
                  if (d < 110) {
                    var a = (1 - d / 110) * 0.32;
                    ctx.beginPath();
                    ctx.moveTo(p.x, p.y);
                    ctx.lineTo(q.x, q.y);
                    ctx.strokeStyle = 'rgba(79,214,166,' + a + ')';
                    ctx.lineWidth = 0.7;
                    ctx.stroke();
                  }
                }

                /* dot */
                ctx.save();
                var rad = p.r + p.glow * 3;
                ctx.beginPath();
                ctx.arc(p.x, p.y, rad, 0, Math.PI * 2);
                if (p.glow > 0.15) {
                  ctx.shadowBlur  = 10 + p.glow * 22;
                  ctx.shadowColor = '#16B981';
                  ctx.fillStyle   = 'rgba(127,255,212,' + (0.55 + p.glow * 0.45) + ')';
                } else {
                  ctx.fillStyle = 'rgba(79,214,166,0.5)';
                }
                ctx.fill();
                ctx.restore();
              }

              raf = requestAnimationFrame(tick);
            }

            resize();
            tick();

            var ro = new ResizeObserver(function() { cancelAnimationFrame(raf); resize(); tick(); });
            ro.observe(canvas.parentElement);
          }

          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initCTACanvas);
          } else {
            initCTACanvas();
          }
        })();
        </script>
      </div>
    </section>
  </main>

  <!-- Footer Include -->
  <?php include 'components/footer.php'; ?>

  <!-- Scripts -->
  <script src="assets/js/scripts.js" defer></script>
</body>
</html>

