<?php
$currentPage = isset($currentPage) ? $currentPage : 'home';
$isHome = ($currentPage === 'home');
$homePrefix = $isHome ? '' : 'index.php';
?>
<header class="navbar">
  <div class="w-full max-w-7xl mx-auto flex items-center justify-between relative px-2">
    <!-- Logo Frame -->
    <a href="<?php echo $homePrefix; ?>#home" class="flex items-center cursor-pointer gap-2.5">
      <img src="assets/images/authentiq_logo.png" alt="Authentiq Logo" class="w-[119px] h-[119px] object-contain" />
    </a>

    <!-- Centered Navigation Menu Array - Desktop Only -->
    <nav class="hidden md:flex items-center justify-center gap-7 absolute left-1/2 -translate-x-1/2">
      <a href="<?php echo $homePrefix; ?>#home" class="text-[15px] font-semibold hover:text-[#16B981] transition-colors <?php echo $currentPage === 'home' ? 'text-[#16B981]' : 'text-[#38434f]'; ?>">
        Home
      </a>
      <a href="<?php echo $homePrefix; ?>#how" class="text-[15px] font-semibold text-[#38434f] hover:text-[#16B981] transition-colors">
        How it works
      </a>
      <a href="<?php echo $homePrefix; ?>#features" class="text-[15px] font-semibold text-[#38434f] hover:text-[#16B981] transition-colors">
        Features
      </a>
      <a href="<?php echo $homePrefix; ?>#pricing" class="text-[15px] font-semibold text-[#38434f] hover:text-[#16B981] transition-colors">
        Pricing
      </a>
      <a href="<?php echo $homePrefix; ?>#faq" class="text-[15px] font-semibold text-[#38434f] hover:text-[#16B981] transition-colors">
        FAQ
      </a>
      <a href="contact.php" class="text-[15px] font-semibold hover:text-[#16B981] transition-colors <?php echo $currentPage === 'contact' ? 'text-[#16B981]' : 'text-[#38434f]'; ?>">
        Contact
      </a>
    </nav>

    <!-- Right side CTA - Desktop Only -->
    <div class="hidden md:flex items-center gap-4">
      <a href="billing.php" class="bg-[#16B981] text-white font-bold text-[15px] px-5 py-2.5 rounded-[10px] shadow-[0_6px_16px_rgba(22,185,129,0.28)] hover:bg-[#13a371] hover:scale-105 hover:!text-white transition-all duration-200 text-center inline-block" style="color: white !important;">
        Start Free Trial
      </a>
    </div>

    <!-- Hamburger Menu Button - Mobile Only -->
    <button id="drawer-open-btn" class="md:hidden p-2 rounded-lg text-[#0F2A43] hover:bg-slate-100 transition-colors cursor-pointer" aria-label="Open menu">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round">
        <line x1="4" y1="7" x2="20" y2="7"></line>
        <line x1="4" y1="12" x2="20" y2="12"></line>
        <line x1="4" y1="17" x2="20" y2="17"></line>
      </svg>
    </button>
  </div>
</header>
