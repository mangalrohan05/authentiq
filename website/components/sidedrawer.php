<?php
$currentPage = isset($currentPage) ? $currentPage : 'home';
$isHome = ($currentPage === 'home');
$homePrefix = $isHome ? '' : 'index.php';
?>
<!-- Mobile Side Drawer Backdrop -->
<div id="drawer-backdrop" class="fixed inset-0 bg-black/50 backdrop-blur-sm z-[1001] opacity-0 pointer-events-none transition-opacity duration-300"></div>

<!-- Mobile Side Drawer Panel -->
<div id="mobile-drawer" class="fixed top-0 right-0 h-full w-80 bg-white shadow-2xl z-[1002] transform translate-x-full transition-transform duration-300 ease-in-out">
  <div class="flex flex-col h-full text-left">
    <!-- Header -->
    <div class="flex items-center justify-between p-6 border-b border-slate-100">
      <div class="flex items-center gap-2.5">
        <img src="assets/images/authentiq_logo.png" alt="Authentiq Logo" class="w-[30px] h-[30px] object-contain" />
        <span class="font-display font-extrabold text-[20px] tracking-tight text-[#0F2A43]">
          Authent<span class="text-[#16B981]">iq</span>
        </span>
      </div>
      <button id="drawer-close-btn" class="p-2 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer" aria-label="Close menu">
        <svg width="24" height="24" fill="none" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" class="text-slate-600">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18L18 6M6 6l12 12" />
        </svg>
      </button>
    </div>

    <!-- Navigation Items -->
    <nav class="flex-1 px-6 py-6">
      <ul class="space-y-1">
        <li>
          <a href="<?php echo $homePrefix; ?>#home" class="block w-full text-left px-4 py-3 rounded-lg transition-all duration-200 cursor-pointer font-semibold text-[16px] text-[#0F2A43] hover:bg-slate-50 hover:text-[#16B981]">
            Home
          </a>
        </li>
        <li>
          <a href="<?php echo $homePrefix; ?>#how" class="block w-full text-left px-4 py-3 rounded-lg transition-all duration-200 cursor-pointer font-semibold text-[16px] text-[#0F2A43] hover:bg-slate-50 hover:text-[#16B981]">
            How it works
          </a>
        </li>
        <li>
          <a href="<?php echo $homePrefix; ?>#features" class="block w-full text-left px-4 py-3 rounded-lg transition-all duration-200 cursor-pointer font-semibold text-[16px] text-[#0F2A43] hover:bg-slate-50 hover:text-[#16B981]">
            Features
          </a>
        </li>
        <li>
          <a href="<?php echo $homePrefix; ?>#pricing" class="block w-full text-left px-4 py-3 rounded-lg transition-all duration-200 cursor-pointer font-semibold text-[16px] text-[#0F2A43] hover:bg-slate-50 hover:text-[#16B981]">
            Pricing
          </a>
        </li>
        <li>
          <a href="<?php echo $homePrefix; ?>#faq" class="block w-full text-left px-4 py-3 rounded-lg transition-all duration-200 cursor-pointer font-semibold text-[16px] text-[#0F2A43] hover:bg-slate-50 hover:text-[#16B981]">
            FAQ
          </a>
        </li>
      </ul>
      <div class="mt-8 px-2">
        <a href="billing.php" class="block w-full bg-[#16B981] text-white font-bold text-[16px] px-5 py-3.5 rounded-[10px] shadow-[0_6px_16px_rgba(22,185,129,0.28)] text-center">
          Start Free Trial
        </a>
      </div>
    </nav>

    <!-- Footer -->
    <div class="p-6 border-t border-slate-100">
      <p class="text-xs text-slate-400 text-center">
        © 2026 Authentiq. All Rights Reserved.
      </p>
    </div>
  </div>
</div>
