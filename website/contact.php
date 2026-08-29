<?php
$currentPage = 'contact';
?>
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <link rel="icon" type="image/png" href="assets/images/favicon.png">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Get in Touch — Authentiq</title>

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

  <div class="w-full min-h-screen bg-slate-50 text-slate-800">
    
    <!-- Hero Header -->
    <div class="relative overflow-hidden pt-32 pb-20 px-6 text-center">
      <!-- Background glow -->
      <div class="absolute inset-0 opacity-[0.08] pointer-events-none">
        <div class="absolute top-[-100px] left-[-100px] w-[500px] h-[500px] rounded-full bg-[#16B981] blur-[140px]"></div>
        <div class="absolute bottom-[-60px] right-[-80px] w-[380px] h-[380px] rounded-full bg-[#0E7C7B] blur-[120px]"></div>
      </div>

      <div class="relative z-10 max-w-7xl mx-auto">
        <h1 class="text-[40px] sm:text-[52px] md:text-[58px] leading-[1.06] font-extrabold tracking-tight text-black font-display">
          Get in <span class="text-[#16B981]">Touch</span>
        </h1>
        <p class="text-[18px] sm:text-[19px] leading-[1.6] text-[#51606d] mt-5 max-w-[540px] mx-auto font-medium">
          Ready to protect your brand? Our team is here to design the perfect solution for you.
        </p>
      </div>
    </div>

    <!-- Main Content -->
    <div class="max-w-7xl mx-auto px-6 pb-24 text-left">
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">

        <!-- Left Column: Contact Info -->
        <div class="lg:col-span-5 space-y-6">
          
          <!-- Email Us -->
          <div class="flex items-start gap-4 bg-white border border-[#eef0f2] rounded-[18px] p-5 hover:bg-slate-100/50 transition-colors duration-300 shadow-sm">
            <div class="w-11 h-11 rounded-[12px] bg-[#16B981]/10 border border-[#16B981]/25 flex items-center justify-center text-[#16B981] flex-shrink-0">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M21.75 6.75v10.5a2.25 2.25 0 0 1-2.25 2.25H4.5A2.25 2.25 0 0 1 2.25 17.25V6.75m19.5 0A2.25 2.25 0 0 0 19.5 4.5H4.5a2.25 2.25 0 0 0-2.25 2.25m19.5 0v.243a2.25 2.25 0 0 1-1.07 1.916l-7.5 4.615a2.25 2.25 0 0 1-2.36 0L3.32 8.91a2.25 2.25 0 0 1-1.07-1.916V6.75" />
              </svg>
            </div>
            <div>
              <p class="text-[11px] text-[#16B981] font-bold uppercase tracking-[0.1em] mb-1">Email Us</p>
              <p class="text-[#0F2A43] text-[15px] font-bold">support@authentiq.io</p>
            </div>
          </div>

          <!-- Call Us -->
          <div class="flex items-start gap-4 bg-white border border-[#eef0f2] rounded-[18px] p-5 hover:bg-slate-100/50 transition-colors duration-300 shadow-sm">
            <div class="w-11 h-11 rounded-[12px] bg-[#16B981]/10 border border-[#16B981]/25 flex items-center justify-center text-[#16B981] flex-shrink-0">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 0 0 2.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-2.824-1.802-5.14-4.118-6.944-6.94l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 0 0-1.091-.852H4.5A2.25 2.25 0 0 0 2.25 4.5v2.25Z" />
              </svg>
            </div>
            <div>
              <p class="text-[11px] text-[#16B981] font-bold uppercase tracking-[0.1em] mb-1">Call Us</p>
              <p class="text-[#0F2A43] text-[15px] font-bold">+91 XXXXX XXXXX</p>
            </div>
          </div>

          <!-- Headquarters -->
          <div class="flex items-start gap-4 bg-white border border-[#eef0f2] rounded-[18px] p-5 hover:bg-slate-100/50 transition-colors duration-300 shadow-sm">
            <div class="w-11 h-11 rounded-[12px] bg-[#16B981]/10 border border-[#16B981]/25 flex items-center justify-center text-[#16B981] flex-shrink-0">
              <svg class="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="1.5">
                <path stroke-linecap="round" stroke-linejoin="round" d="M15 10.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z" />
                <path stroke-linecap="round" stroke-linejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1 1 15 0Z" />
              </svg>
            </div>
            <div>
              <p class="text-[11px] text-[#16B981] font-bold uppercase tracking-[0.1em] mb-1">Headquarters</p>
              <p class="text-[#0F2A43] text-[15px] font-bold">Authentiq Operations, Jaipur</p>
            </div>
          </div>

          <!-- Decorative Quote -->
          <div class="mt-4 bg-[#e6f6ef]/50 border border-[#16B981]/15 rounded-[18px] p-6">
            <div class="mb-4">
              <img src="assets/images/authentiq_logo.png" alt="Authentiq" class="h-7 object-contain" />
            </div>
            <p class="text-[15px] leading-[1.7] text-[#20604f] font-medium italic">
              "Every product deserves a trusted identity. Let's build that for your brand."
            </p>
          </div>

        </div>

        <!-- Right Column: Form Card -->
        <div class="lg:col-span-7">
          <div class="bg-white border border-[#eef0f2] rounded-[24px] p-8 sm:p-10 shadow-[0_16px_40px_rgba(15,42,67,0.05)]">
            <h2 class="font-display font-bold text-[22px] text-[#0F2A43] mb-1">Send us a message</h2>
            <p class="text-[14px] text-[#51606d] mb-8 font-medium">We'll get back to you within 24 hours.</p>

            <form id="contact-form" class="space-y-5">
              <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <div class="space-y-2">
                  <label class="block text-[11px] font-bold uppercase tracking-[0.1em] text-[#16B981]">Full Name</label>
                  <input
                    type="text"
                    required
                    placeholder="John Doe"
                    class="w-full bg-white border border-[#eaedef] rounded-[12px] px-4 py-3.5 text-[14px] text-[#0F2A43] placeholder-[#a3adb5] focus:outline-none focus:border-[#16B981] focus:bg-slate-50/50 transition-all font-medium font-sans"
                  />
                </div>
                <div class="space-y-2">
                  <label class="block text-[11px] font-bold uppercase tracking-[0.1em] text-[#16B981]">Email Address</label>
                  <input
                    type="email"
                    required
                    placeholder="you@domain.com"
                    class="w-full bg-white border border-[#eaedef] rounded-[12px] px-4 py-3.5 text-[14px] text-[#0F2A43] placeholder-[#a3adb5] focus:outline-none focus:border-[#16B981] focus:bg-slate-50/50 transition-all font-medium font-sans"
                  />
                </div>
              </div>

              <div class="space-y-2">
                <label class="block text-[11px] font-bold uppercase tracking-[0.1em] text-[#16B981]">Company / Brand</label>
                <input
                  type="text"
                  required
                  placeholder="Your company name"
                  class="w-full bg-white border border-[#eaedef] rounded-[12px] px-4 py-3.5 text-[14px] text-[#0F2A43] placeholder-[#a3adb5] focus:outline-none focus:border-[#16B981] focus:bg-slate-50/50 transition-all font-medium font-sans"
                />
              </div>

              <div class="space-y-2">
                <label class="block text-[11px] font-bold uppercase tracking-[0.1em] text-[#16B981]">Project Type</label>
                <input
                  type="text"
                  required
                  placeholder="Supply Chain Protection / Serialized QR / Enterprise"
                  class="w-full bg-white border border-[#eaedef] rounded-[12px] px-4 py-3.5 text-[14px] text-[#0F2A43] placeholder-[#a3adb5] focus:outline-none focus:border-[#16B981] focus:bg-slate-50/50 transition-all font-medium font-sans"
                />
              </div>

              <div class="space-y-2">
                <label class="block text-[11px] font-bold uppercase tracking-[0.1em] text-[#16B981]">Inquiry Details</label>
                <textarea
                  rows="4"
                  required
                  placeholder="Describe your tracking volume and requirements..."
                  class="w-full bg-white border border-[#eaedef] rounded-[12px] px-4 py-3.5 text-[14px] text-[#0F2A43] placeholder-[#a3adb5] focus:outline-none focus:border-[#16B981] focus:bg-slate-50/50 transition-all font-medium resize-none font-sans"
                ></textarea>
              </div>

              <button
                type="submit"
                class="w-full py-4 bg-[#16B981] text-white font-bold text-[15px] rounded-[14px] hover:bg-[#13a371] hover:scale-[1.02] active:scale-[0.98] transition-all duration-200 cursor-pointer shadow-[0_10px_30px_rgba(22,185,129,0.35)] tracking-wide font-sans"
              >
                Send Message →
              </button>
            </form>
          </div>
        </div>

      </div>
    </div>
  </div>

  <!-- Footer Include -->
  <?php include 'components/footer.php'; ?>

  <!-- Scripts -->
  <script src="assets/js/scripts.js" defer></script>
  
  <script>
    document.getElementById('contact-form').addEventListener('submit', (e) => {
      e.preventDefault();
      alert('Thank you! Your message has been simulated successfully and is ready to transmit.');
      e.target.reset();
    });
  </script>
</body>
</html>
