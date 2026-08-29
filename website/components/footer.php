<?php
$currentPage = isset($currentPage) ? $currentPage : 'home';
$isHome = ($currentPage === 'home');
$homePrefix = $isHome ? '' : 'index.php';
?>
<footer id="contact" class="w-full bg-[#0b1d2e] pt-16 pb-8 border-t border-[#122e47]">
  <div class="max-w-7xl mx-auto px-6">
    <div class="grid grid-cols-1 md:grid-cols-4 gap-12 mb-16">
      <div class="md:col-span-2">
        <div class="mb-6">
          <img src="assets/images/authentiq_logo_dark.png" alt="Authentiq Logo" class="w-[267px] h-auto object-contain" />
        </div>
        <p class="text-[15px] leading-[1.65] text-[#8b9ba8] max-w-[380px] font-medium">
          We build secure cryptographic tracking layers to bring supply chain integrity and absolute verification to every product.
        </p>
      </div>

      <div>
        <h3 class="font-display font-bold text-[14px] uppercase tracking-wider text-white mb-5">Product</h3>
        <ul class="flex flex-col gap-3.5 text-[15px] text-[#8b9ba8] font-medium">
          <li><a href="<?php echo $homePrefix; ?>#how" class="hover:text-[#4fd6a6] transition-colors cursor-pointer">How it works</a></li>
          <li><a href="<?php echo $homePrefix; ?>#features" class="hover:text-[#4fd6a6] transition-colors cursor-pointer">Features</a></li>
          <li><a href="<?php echo $homePrefix; ?>#pricing" class="hover:text-[#4fd6a6] transition-colors cursor-pointer">Pricing</a></li>
          <li><a href="<?php echo $homePrefix; ?>#faq" class="hover:text-[#4fd6a6] transition-colors cursor-pointer">FAQ</a></li>
        </ul>
      </div>

      <div>
        <h3 class="font-display font-bold text-[14px] uppercase tracking-wider text-white mb-5">Company</h3>
        <ul class="flex flex-col gap-3.5 text-[15px] text-[#8b9ba8] font-medium">
          <li><a href="contact.php" class="hover:text-[#4fd6a6] transition-colors cursor-pointer">Contact Us</a></li>
          <li><a href="privacy.php" class="hover:text-[#4fd6a6] transition-colors cursor-pointer">Privacy Policy</a></li>
          <li><a href="terms.php" class="hover:text-[#4fd6a6] transition-colors cursor-pointer">Terms of Service</a></li>
        </ul>
      </div>
    </div>

    <div class="pt-8 border-t border-[#1a3752] flex flex-col sm:flex-row items-center justify-between gap-4">
      <p class="text-[14px] text-[#5c7385] font-medium">
        © 2026 Authentiq. All Rights Reserved.
      </p>
      <a href="mailto:info@authentiq.com" class="text-[14px] text-[#5c7385] font-medium hover:text-[#4fd6a6] transition-colors cursor-pointer">
        info@authentiq.com
      </a>
    </div>
  </div>
</footer>
