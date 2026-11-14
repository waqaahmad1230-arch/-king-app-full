import React from 'react';

export default function PrivacyPolicy() {
  return (
    <div className="min-h-screen bg-[#040812] text-white p-6">
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-3xl font-black text-[#FFD700]">Privacy Policy - King Auto Sher</h1>
        <p className="text-sm text-slate-400">Last Updated: October 19, 2026</p>
        
        <section className="space-y-2">
          <h2 className="text-xl font-bold">1. Information We Collect</h2>
          <p className="text-sm text-slate-300">
            To provide the "King Auto Sher" service (auto-posting of shayari), we collect the following:
            <ul className="list-disc pl-5 mt-2 space-y-1">
              <li>Name (from your Google/Facebook profile)</li>
              <li>Profile Picture (from your Google/Facebook profile)</li>
              <li>Page data (if you authorize us to post to your Facebook Pages)</li>
            </ul>
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">2. How We Use Your Data</h2>
          <p className="text-sm text-slate-300">
            We use this information solely to enable the automated posting of shayari to your connected Facebook accounts. We do not use your data for any other purpose.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">3. Data Sharing</h2>
          <p className="text-sm text-slate-300">
            We do not share, sell, or rent your personal data with third parties.
          </p>
        </section>

        <section className="space-y-2">
          <h2 className="text-xl font-bold">4. Data Deletion</h2>
          <p className="text-sm text-slate-300">
            You can request the deletion of your data at any time by sending an email to <a href="mailto:kingautosher@gmail.com" className="text-cyan-400 underline">kingautosher@gmail.com</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
