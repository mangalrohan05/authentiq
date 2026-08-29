'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { completeOnboarding } from '@/services/api';
import { useRouter } from 'next/navigation';

const locationData: Record<string, Record<string, string[]>> = {
  'India': {
    'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Tirupati'],
    'Arunachal Pradesh': ['Itanagar', 'Naharlagun', 'Pasighat'],
    'Assam': ['Guwahati', 'Silchar', 'Dibrugarh', 'Jorhat', 'Nagaon'],
    'Bihar': ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Purnia'],
    'Chhattisgarh': ['Raipur', 'Bhilai', 'Bilaspur', 'Korba'],
    'Delhi': ['New Delhi', 'North Delhi', 'South Delhi', 'West Delhi', 'Dwarka'],
    'Goa': ['Panaji', 'Margao', 'Vasco da Gama', 'Mapusa'],
    'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar'],
    'Haryana': ['Faridabad', 'Gurugram', 'Panipat', 'Ambala', 'Yamunanagar'],
    'Himachal Pradesh': ['Shimla', 'Dharamshala', 'Solan', 'Mandi'],
    'Jharkhand': ['Ranchi', 'Jamshedpur', 'Dhanbad', 'Bokaro', 'Deoghar'],
    'Karnataka': ['Bengaluru', 'Mysuru', 'Hubballi', 'Mangaluru', 'Belagavi'],
    'Kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Kollam', 'Thrissur'],
    'Madhya Pradesh': ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain'],
    'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Navi Mumbai', 'Aurangabad', 'Solapur'],
    'Manipur': ['Imphal', 'Thoubal', 'Bishnupur'],
    'Meghalaya': ['Shillong', 'Tura', 'Jowai'],
    'Mizoram': ['Aizawl', 'Lunglei', 'Champhai'],
    'Nagaland': ['Kohima', 'Dimapur', 'Mokokchung'],
    'Odisha': ['Bhubaneswar', 'Cuttack', 'Rourkela', 'Sambalpur', 'Puri'],
    'Punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda'],
    'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Kota', 'Ajmer', 'Bikaner'],
    'Sikkim': ['Gangtok', 'Namchi', 'Geyzing'],
    'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Salem', 'Trichy', 'Tirunelveli'],
    'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Khammam', 'Karimnagar'],
    'Tripura': ['Agartala', 'Dharmanagar', 'Udaipur'],
    'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Noida', 'Ghaziabad', 'Agra', 'Varanasi', 'Meerut', 'Allahabad'],
    'Uttarakhand': ['Dehradun', 'Haridwar', 'Haldwani', 'Roorkee'],
    'West Bengal': ['Kolkata', 'Howrah', 'Durgapur', 'Asansol', 'Siliguri']
  },
  'United States': {
    'California': ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento'],
    'New York': ['New York City', 'Buffalo', 'Rochester', 'Syracuse', 'Albany'],
    'Texas': ['Houston', 'Austin', 'Dallas', 'San Antonio', 'Fort Worth'],
    'Florida': ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Tallahassee'],
    'Illinois': ['Chicago', 'Aurora', 'Naperville', 'Joliet', 'Rockford'],
    'Washington': ['Seattle', 'Spokane', 'Tacoma', 'Bellevue', 'Olympia']
  },
  'United Kingdom': {
    'England': ['London', 'Birmingham', 'Manchester', 'Leeds', 'Liverpool', 'Newcastle'],
    'Scotland': ['Edinburgh', 'Glasgow', 'Aberdeen', 'Dundee', 'Inverness'],
    'Wales': ['Cardiff', 'Swansea', 'Newport', 'Bangor'],
    'Northern Ireland': ['Belfast', 'Derry', 'Lisburn', 'Newry']
  }
};

export default function InitialSetupWizard() {
  const { user, logout } = useAuth();
  const router = useRouter();

  const [step, setStep] = useState<number>(1);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Form states
  const [legalName, setLegalName] = useState<string>('');
  const [companyType, setCompanyType] = useState<string>('');
  const [gstin, setGstin] = useState<string>('');
  const [pan, setPan] = useState<string>('');
  const [cin, setCin] = useState<string>('');
  const [addressLine1, setAddressLine1] = useState<string>('');
  const [addressLine2, setAddressLine2] = useState<string>('');
  const [city, setCity] = useState<string>('');
  const [stateName, setStateName] = useState<string>('');
  const [pinCode, setPinCode] = useState<string>('');
  const [selectedCountry, setSelectedCountry] = useState<string>('India');
  const [industry, setIndustry] = useState<string>('');
  const [website, setWebsite] = useState<string>('');

  const [isCustomCountry, setIsCustomCountry] = useState<boolean>(false);
  const [isCustomState, setIsCustomState] = useState<boolean>(false);
  const [isCustomCity, setIsCustomCity] = useState<boolean>(false);

  const [apiCountries, setApiCountries] = useState<string[]>([]);
  const [apiStates, setApiStates] = useState<string[]>([]);
  const [apiCities, setApiCities] = useState<string[]>([]);

  const [loadingCountries, setLoadingCountries] = useState<boolean>(false);
  const [loadingStates, setLoadingStates] = useState<boolean>(false);
  const [loadingCities, setLoadingCities] = useState<boolean>(false);

  const countries = Array.from(new Set([
    ...apiCountries,
    ...Object.keys(locationData),
    ...(selectedCountry ? [selectedCountry] : [])
  ])).filter(Boolean).sort();

  const states = Array.from(new Set([
    ...apiStates,
    ...Object.keys(locationData[selectedCountry] || {}),
    ...(stateName ? [stateName] : [])
  ])).filter(Boolean).sort();

  const cities = Array.from(new Set([
    ...apiCities,
    ...(locationData[selectedCountry]?.[stateName] || []),
    ...(city ? [city] : [])
  ])).filter(Boolean).sort();

  // Contact Details
  const [fullName, setFullName] = useState<string>('');
  const [email, setEmail] = useState<string>('');
  const [phone, setPhone] = useState<string>('');
  const [designation, setDesignation] = useState<string>('');

  // Compliance Documents Simulated States
  const [gstCertFile, setGstCertFile] = useState<string>('');
  const [incDocFile, setIncDocFile] = useState<string>('');
  const [pharmaDrugLicense, setPharmaDrugLicense] = useState<string>('');
  const [pharmaDrugLicenseFile, setPharmaDrugLicenseFile] = useState<string>('');
  const [fssaiLicense, setFssaiLicense] = useState<string>('');
  const [fssaiLicenseFile, setFssaiLicenseFile] = useState<string>('');
  const [exciseLicenseFile, setExciseLicenseFile] = useState<string>('');

  // Verification simulation progress logs
  const [simulationStep, setSimulationStep] = useState<number>(0);
  const [simulationLogs, setSimulationLogs] = useState<Array<{ label: string; status: 'pending' | 'loading' | 'success' }>>([
    { label: 'Checking company registration database...', status: 'pending' },
    { label: 'Validating GSTIN & Company PAN credentials...', status: 'pending' },
    { label: 'Checking corporate compliance documents...', status: 'pending' },
    { label: 'Finalizing corporate profile setup...', status: 'pending' },
  ]);

  // Pre-populate fields on load using current user data if available
  useEffect(() => {
    // We can query company details or pre-fill contact info
    if (user) {
      setFullName(user.name || '');
      setEmail(user.email || '');
    }

    const detectLocation = async () => {
      try {
        const res = await fetch('https://ipapi.co/json/');
        if (res.ok) {
          const data = await res.json();
          if (data.country_name) {
            setSelectedCountry(data.country_name);
            setIsCustomCountry(false);
          }
          if (data.region) {
            setStateName(data.region);
            setIsCustomState(false);
          }
          if (data.city) {
            setCity(data.city);
            setIsCustomCity(false);
          }
          if (data.postal) setPinCode(data.postal);
        }
      } catch (err) {
        console.warn('Geolocation detection failed:', err);
      }
    };
    detectLocation();

    const fetchInitialData = async () => {
      try {
        const res = await fetch('http://localhost:8000/vendor/profile/company', {
          headers: {
            'Authorization': `Bearer ${localStorage.getItem('authentiq_vendor_token')}`
          }
        });
        if (res.ok) {
          const data = await res.json();
          setLegalName(data.legal_company_name || '');
          setCompanyType(data.company_type || '');
          setIndustry(data.industry_sector || '');
          setWebsite(data.company_website || '');
          setFullName(data.contact_full_name || user?.name || '');
          setEmail(data.contact_work_email || user?.email || '');
          setPhone(data.contact_mobile?.replace('+91', '') || '');
          setDesignation(data.contact_designation || '');
          if (data.reg_country) {
            setSelectedCountry(data.reg_country);
            setIsCustomCountry(false);
          }
          if (data.reg_state) {
            setStateName(data.reg_state);
            setIsCustomState(false);
          }
          if (data.reg_city) {
            setCity(data.reg_city);
            setIsCustomCity(false);
          }
          if (data.reg_pin) setPinCode(data.reg_pin);
        }
      } catch (err) {
        console.warn('Could not pre-fetch company details:', err);
      }
    };
    fetchInitialData();
  }, [user]);

  // Fetch Countries list from CountriesNow API
  useEffect(() => {
    const fetchCountries = async () => {
      setLoadingCountries(true);
      try {
        const res = await fetch('https://countriesnow.space/api/v0.1/countries');
        if (res.ok) {
          const body = await res.json();
          if (!body.error && body.data) {
            setApiCountries(body.data.map((c: any) => c.country));
          }
        }
      } catch (err) {
        console.warn('Failed to fetch countries:', err);
      } finally {
        setLoadingCountries(false);
      }
    };
    fetchCountries();
  }, []);

  // Fetch States list based on selected Country
  useEffect(() => {
    if (!selectedCountry) {
      setApiStates([]);
      return;
    }
    const fetchStates = async () => {
      setLoadingStates(true);
      try {
        const res = await fetch('https://countriesnow.space/api/v0.1/countries/states', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ country: selectedCountry })
        });
        if (res.ok) {
          const body = await res.json();
          if (!body.error && body.data?.states) {
            setApiStates(body.data.states.map((s: any) => s.name));
          }
        }
      } catch (err) {
        console.warn('Failed to fetch states:', err);
      } finally {
        setLoadingStates(false);
      }
    };
    fetchStates();
  }, [selectedCountry]);

  // Fetch Cities list based on selected Country and State
  useEffect(() => {
    if (!selectedCountry || !stateName) {
      setApiCities([]);
      return;
    }
    const fetchCities = async () => {
      setLoadingCities(true);
      try {
        const res = await fetch('https://countriesnow.space/api/v0.1/countries/state/cities', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ country: selectedCountry, state: stateName })
        });
        if (res.ok) {
          const body = await res.json();
          if (!body.error && body.data) {
            setApiCities(body.data);
          }
        }
      } catch (err) {
        console.warn('Failed to fetch cities:', err);
      } finally {
        setLoadingCities(false);
      }
    };
    fetchCities();
  }, [selectedCountry, stateName]);

  const handlePinCodeChange = async (val: string) => {
    const cleanVal = val.replace(/\s/g, '');
    setPinCode(cleanVal);

    if (cleanVal.length === 6) {
      try {
        const res = await fetch(`https://api.postalpincode.in/pincode/${cleanVal}`);
        if (res.ok) {
          const data = await res.json();
          if (data[0]?.Status === 'Success' && data[0]?.PostOffice?.length > 0) {
            const office = data[0].PostOffice[0];
            if (office.State) {
              setStateName(office.State);
              setIsCustomState(false);
            }
            if (office.District) {
              setCity(office.District);
              setIsCustomCity(false);
            }
            if (office.Country) {
              setSelectedCountry(office.Country);
              setIsCustomCountry(false);
            }
          }
        }
      } catch (err) {
        console.warn('PIN code lookup failed:', err);
      }
    }
  };

  const validateCurrentStep = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (step === 1) {
      if (!legalName.trim()) newErrors.legalName = 'Company name is required';
      if (!companyType) newErrors.companyType = 'Company type is required';
      if (!industry) newErrors.industry = 'Industry/sector is required';

      if (!gstin.trim()) {
        newErrors.gstin = 'GSTIN is required';
      } else {
        const gstinRegex = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/;
        if (!gstinRegex.test(gstin.trim().toUpperCase())) {
          newErrors.gstin = 'Invalid GSTIN format (e.g. 27AAAAA1111A1Z1)';
        }
      }

      if (!pan.trim()) {
        newErrors.pan = 'PAN is required';
      } else {
        const panRegex = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;
        if (!panRegex.test(pan.trim().toUpperCase())) {
          newErrors.pan = 'Invalid PAN format (e.g. ABCDE1234F)';
        }
      }

      if (!addressLine1.trim()) newErrors.addressLine1 = 'Registered address line 1 is required';
      if (!city.trim()) newErrors.city = 'City is required';
      if (!stateName.trim()) newErrors.stateName = 'State is required';

      if (!pinCode.trim()) {
        newErrors.pinCode = 'PIN code is required';
      } else {
        const pinRegex = /^[1-9][0-9]{5}$/;
        if (!pinRegex.test(pinCode.trim())) {
          newErrors.pinCode = 'Invalid 6-digit PIN code';
        }
      }

      if (!fullName.trim()) newErrors.fullName = 'Contact full name is required';
      if (!phone.trim()) newErrors.phone = 'Mobile number is required';
      if (!designation.trim()) newErrors.designation = 'Designation is required';
    }

    if (step === 2) {
      if (!gstCertFile) newErrors.gstCertFile = 'GST Certificate copy is required';
      if (!incDocFile) newErrors.incDocFile = 'Incorporation Document is required';

      if (industry === 'Pharma') {
        if (!pharmaDrugLicense.trim()) newErrors.pharmaDrugLicense = 'Drug license number is required';
        if (!pharmaDrugLicenseFile) newErrors.pharmaDrugLicenseFile = 'Drug license file is required';
      } else if (industry === 'FMCG') {
        if (!fssaiLicense.trim()) newErrors.fssaiLicense = 'FSSAI license number is required';
        if (!fssaiLicenseFile) newErrors.fssaiLicenseFile = 'FSSAI license file is required';
      } else if (industry === 'Liquor') {
        if (!exciseLicenseFile) newErrors.exciseLicenseFile = 'State Excise license copy is required';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleNext = () => {
    if (validateCurrentStep()) {
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    setStep(step - 1);
    setErrors({});
  };

  const startSimulation = async () => {
    if (!validateCurrentStep()) return;
    setStep(3);
    setSubmitting(true);

    const logs = [...simulationLogs];

    // Sim step 1
    logs[0].status = 'loading';
    setSimulationLogs([...logs]);
    await new Promise(r => setTimeout(r, 1200));
    logs[0].status = 'success';
    logs[1].status = 'loading';
    setSimulationLogs([...logs]);

    // Sim step 2
    await new Promise(r => setTimeout(r, 1200));
    logs[1].status = 'success';
    logs[2].status = 'loading';
    setSimulationLogs([...logs]);

    // Sim step 3
    await new Promise(r => setTimeout(r, 1200));
    logs[2].status = 'success';
    logs[3].status = 'loading';
    setSimulationLogs([...logs]);

    // Sim step 4
    await new Promise(r => setTimeout(r, 1000));
    logs[3].status = 'success';
    setSimulationLogs([...logs]);

    // Submit payload
    const payload = {
      legal_company_name: legalName,
      company_type: companyType,
      gstin: gstin,
      pan: pan,
      cin: cin || null,
      reg_address_line1: addressLine1,
      reg_address_line2: addressLine2 || null,
      reg_city: city,
      reg_state: stateName,
      reg_pin: pinCode,
      reg_country: selectedCountry,
      industry_sector: industry,
      company_website: website || null,
      contact_full_name: fullName,
      contact_work_email: email,
      contact_mobile: phone,
      contact_designation: designation,
      gst_cert_file: gstCertFile,
      inc_doc_file: incDocFile,
      pharma_drug_license_file: pharmaDrugLicenseFile || null,
      fssai_license_file: fssaiLicenseFile || null,
      excise_license_file: exciseLicenseFile || null,
    };

    try {
      await completeOnboarding(payload);
      // Hard redirect to dashboard to sync the state in AuthContext.tsx
      window.location.href = '/vendor';
    } catch (err: any) {
      alert(err.message || 'Verification submission failed. Please try again.');
      setSubmitting(false);
      setStep(2);
      // Reset logs status
      setSimulationLogs([
        { label: 'Checking company registration database...', status: 'pending' },
        { label: 'Validating GSTIN & Company PAN credentials...', status: 'pending' },
        { label: 'Checking corporate compliance documents...', status: 'pending' },
        { label: 'Finalizing corporate profile setup...', status: 'pending' },
      ]);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center py-16 px-4 sm:px-6 lg:px-8 text-slate-800 font-sans">
      <div className="max-w-3xl w-full bg-white rounded-3xl border border-slate-200/80 shadow-2xl overflow-hidden p-8 sm:p-10 space-y-8">
        
        {/* Header */}
        <div className="border-b border-slate-100 pb-6 text-center sm:text-left flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl sm:text-3xl font-extrabold text-[#003057]">Corporate Verification Gate</h2>
            <p className="text-slate-550 text-xs mt-1.5 font-normal">Please complete mandatory business compliance registration to access your dashboard.</p>
          </div>
          <div className="flex items-center gap-3 self-center sm:self-auto">
            <div className="bg-[#003057] text-white px-4 py-1.5 rounded-full text-xs font-semibold tracking-wider whitespace-nowrap">
              Step {step} of 3
            </div>
          </div>
        </div>


        {/* Step 1: Corporate Profile Form */}
        {step === 1 && (
          <div className="space-y-6 animate-fadeIn">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Legal Company Name *</label>
                <input
                  type="text"
                  value={legalName}
                  onChange={(e) => setLegalName(e.target.value)}
                  placeholder="Acme Brands Pvt Ltd"
                  className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 ${errors.legalName ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200'}`}
                />
                {errors.legalName && <p className="text-[10px] text-red-500 font-medium">{errors.legalName}</p>}
              </div>

              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Company Type *</label>
                <select
                  value={companyType}
                  onChange={(e) => setCompanyType(e.target.value)}
                  className={`w-full bg-slate-50 border rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 cursor-pointer ${errors.companyType ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200'}`}
                >
                  <option value="">Select Structure</option>
                  <option value="Proprietorship">Proprietorship</option>
                  <option value="Partnership">Partnership Firm</option>
                  <option value="LLP">Limited Liability Partnership (LLP)</option>
                  <option value="Pvt Ltd">Private Limited (Pvt Ltd)</option>
                  <option value="Public Ltd">Public Limited Co.</option>
                </select>
                {errors.companyType && <p className="text-[10px] text-red-500 font-medium">{errors.companyType}</p>}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-t border-slate-100 pt-6">
              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-550">GSTIN *</label>
                <input
                  type="text"
                  value={gstin}
                  onChange={(e) => setGstin(e.target.value.toUpperCase())}
                  placeholder="27AAAAA1111A1Z1"
                  maxLength={15}
                  className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 ${errors.gstin ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200'}`}
                />
                {errors.gstin && <p className="text-[10px] text-red-500 font-medium">{errors.gstin}</p>}
              </div>

              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Company PAN *</label>
                <input
                  type="text"
                  value={pan}
                  onChange={(e) => setPan(e.target.value.toUpperCase())}
                  placeholder="AAAAA1111A"
                  maxLength={10}
                  className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 ${errors.pan ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200'}`}
                />
                {errors.pan && <p className="text-[10px] text-red-500 font-medium">{errors.pan}</p>}
              </div>

              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Corporate ID Number (CIN)</label>
                <input
                  type="text"
                  value={cin}
                  onChange={(e) => setCin(e.target.value.toUpperCase())}
                  placeholder="U11111MH2021PTC111111"
                  maxLength={21}
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6 space-y-4">
              <h3 className="text-sm font-semibold text-[#003057] uppercase tracking-wider text-left">Registered Address</h3>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Address Line 1 *</label>
                  <input
                    type="text"
                    value={addressLine1}
                    onChange={(e) => setAddressLine1(e.target.value)}
                    placeholder="Registered building, street"
                    className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 ${errors.addressLine1 ? 'border-red-500' : 'border-slate-200'}`}
                  />
                  {errors.addressLine1 && <p className="text-[10px] text-red-500">{errors.addressLine1}</p>}
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Address Line 2</label>
                  <input
                    type="text"
                    value={addressLine2}
                    onChange={(e) => setAddressLine2(e.target.value)}
                    placeholder="Floor, landmark (optional)"
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4 pt-1">
                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">PIN Code *</label>
                  <input
                    type="text"
                    value={pinCode}
                    onChange={(e) => handlePinCodeChange(e.target.value)}
                    placeholder="400001"
                    maxLength={6}
                    className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 ${errors.pinCode ? 'border-red-500' : 'border-slate-200'}`}
                  />
                  {errors.pinCode && <p className="text-[10px] text-red-500">{errors.pinCode}</p>}
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">Country *</label>
                  {isCustomCountry ? (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={selectedCountry}
                        onChange={(e) => setSelectedCountry(e.target.value)}
                        placeholder="Enter Country"
                        className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCountry(false);
                          setSelectedCountry('India');
                        }}
                        className="px-2 border border-slate-200 rounded-xl text-[10px] font-bold hover:bg-slate-50 text-slate-500 cursor-pointer"
                      >
                        List
                      </button>
                    </div>
                  ) : (
                    <select
                      value={selectedCountry}
                      onChange={(e) => {
                        if (e.target.value === 'CUSTOM') {
                          setIsCustomCountry(true);
                          setSelectedCountry('');
                        } else {
                          setSelectedCountry(e.target.value);
                          setIsCustomCountry(false);
                        }
                        setStateName('');
                        setCity('');
                      }}
                      className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-3.5 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 cursor-pointer"
                    >
                      <option value="">{loadingCountries ? 'Loading countries...' : 'Select Country'}</option>
                      {countries.map(c => <option key={c} value={c}>{c}</option>)}
                      <option value="CUSTOM">Other / Custom...</option>
                    </select>
                  )}
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">State / Province *</label>
                  {isCustomState ? (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={stateName}
                        onChange={(e) => setStateName(e.target.value)}
                        placeholder="Enter State"
                        className={`flex-1 bg-slate-50 border rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 ${errors.stateName ? 'border-red-500' : 'border-slate-200'}`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomState(false);
                          setStateName('');
                        }}
                        className="px-2 border border-slate-200 rounded-xl text-[10px] font-bold hover:bg-slate-50 text-slate-500 cursor-pointer"
                      >
                        List
                      </button>
                    </div>
                  ) : (
                    <select
                      value={stateName}
                      onChange={(e) => {
                        if (e.target.value === 'CUSTOM') {
                          setIsCustomState(true);
                          setStateName('');
                        } else {
                          setStateName(e.target.value);
                          setIsCustomState(false);
                        }
                        setCity('');
                      }}
                      className={`w-full bg-slate-50 border rounded-xl px-3 py-3.5 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 cursor-pointer ${errors.stateName ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200'}`}
                    >
                      <option value="">{loadingStates ? 'Loading states...' : 'Select State'}</option>
                      {states.map(s => <option key={s} value={s}>{s}</option>)}
                      <option value="CUSTOM">Other / Custom...</option>
                    </select>
                  )}
                  {errors.stateName && <p className="text-[10px] text-red-500">{errors.stateName}</p>}
                </div>

                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-semibold uppercase tracking-wider text-slate-400">City *</label>
                  {isCustomCity ? (
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Enter City"
                        className={`flex-1 bg-slate-50 border rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 ${errors.city ? 'border-red-500' : 'border-slate-200'}`}
                      />
                      <button
                        type="button"
                        onClick={() => {
                          setIsCustomCity(false);
                          setCity('');
                        }}
                        className="px-2 border border-slate-200 rounded-xl text-[10px] font-bold hover:bg-slate-50 text-slate-500 cursor-pointer"
                      >
                        List
                      </button>
                    </div>
                  ) : (
                    <select
                      value={city}
                      onChange={(e) => {
                        if (e.target.value === 'CUSTOM') {
                          setIsCustomCity(true);
                          setCity('');
                        } else {
                          setCity(e.target.value);
                          setIsCustomCity(false);
                        }
                      }}
                      className={`w-full bg-slate-50 border rounded-xl px-3 py-3.5 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 cursor-pointer ${errors.city ? 'border-red-500 ring-1 ring-red-500' : 'border-slate-200'}`}
                    >
                      <option value="">{loadingCities ? 'Loading cities...' : 'Select City'}</option>
                      {cities.map(ct => <option key={ct} value={ct}>{ct}</option>)}
                      <option value="CUSTOM">Other / Custom...</option>
                    </select>
                  )}
                  {errors.city && <p className="text-[10px] text-red-500">{errors.city}</p>}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 border-t border-slate-150 pt-6">
              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Industry / Sector *</label>
                <select
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  className={`w-full bg-slate-50 border rounded-xl px-4 py-3.5 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 ${errors.industry ? 'border-red-500' : 'border-slate-200'}`}
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
                {errors.industry && <p className="text-[10px] text-red-500">{errors.industry}</p>}
              </div>
              <div className="space-y-1.5 text-left">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-550">Company Website</label>
                <input
                  type="url"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  placeholder="https://www.acmebrands.com"
                  className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800"
                />
              </div>
            </div>

            <div className="border-t border-slate-100 pt-6 space-y-4">
              <h3 className="text-sm font-semibold text-[#003057] uppercase tracking-wider text-left">Primary Contact Representative</h3>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Full Name *</label>
                  <input
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Representative Name"
                    className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 ${errors.fullName ? 'border-red-500' : 'border-slate-200'}`}
                  />
                  {errors.fullName && <p className="text-[10px] text-red-500">{errors.fullName}</p>}
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Designation / Role *</label>
                  <input
                    type="text"
                    value={designation}
                    onChange={(e) => setDesignation(e.target.value)}
                    placeholder="e.g. Compliance Officer"
                    className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 ${errors.designation ? 'border-red-500' : 'border-slate-200'}`}
                  />
                  {errors.designation && <p className="text-[10px] text-red-500">{errors.designation}</p>}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Mobile Number *</label>
                  <input
                    type="tel"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value.replace(/\D/g, ''))}
                    placeholder="9876543210"
                    maxLength={10}
                    className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-[#00b074] text-slate-800 ${errors.phone ? 'border-red-500' : 'border-slate-200'}`}
                  />
                  {errors.phone && <p className="text-[10px] text-red-500">{errors.phone}</p>}
                </div>
                <div className="space-y-1.5 text-left">
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">Work Email Address</label>
                  <input
                    type="email"
                    value={email}
                    disabled
                    className="w-full bg-slate-100 border border-slate-200 rounded-xl px-4 py-3 text-sm text-slate-400 cursor-not-allowed"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-slate-100">
              <button
                type="button"
                onClick={() => logout()}
                style={{ border: '1px solid #ef4444', color: '#ef4444', backgroundColor: 'transparent' }}
                className="hover:bg-red-50 font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer select-none"
              >
                Log Out
              </button>
              <button
                type="button"
                onClick={handleNext}
                style={{ backgroundColor: '#00b074', color: '#ffffff' }}
                className="hover:bg-[#009660] text-white font-bold py-3.5 px-8 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
              >
                Proceed to Documents →
              </button>
            </div>
          </div>
        )}

        {/* Step 2: Compliance Certificates Upload */}
        {step === 2 && (
          <div className="space-y-6 animate-fadeIn text-left">
            <div>
              <h3 className="text-sm font-semibold text-[#003057] uppercase tracking-wider">Mandatory Certificates Upload</h3>
              <p className="text-xs text-slate-500 mt-0.5">Please provide registered legal entity credentials to initialize catalog verification sync.</p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">GST Certificate Copy *</label>
                <div
                  className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-slate-50/50 ${gstCertFile ? 'border-emerald-500 bg-emerald-50/10' : errors.gstCertFile ? 'border-red-500 bg-red-50/5' : 'border-slate-200'}`}
                  onClick={() => {
                    setGstCertFile(`gst_certificate_${legalName.toLowerCase().replace(/\s+/g, '_') || 'company'}.pdf`);
                    setErrors({ ...errors, gstCertFile: '' });
                  }}
                >
                  <span className="text-xl mb-1.5">{gstCertFile ? '📄' : '📁'}</span>
                  <span className="text-xs font-semibold text-slate-700">{gstCertFile ? gstCertFile : 'Attach GST Certificate PDF'}</span>
                  <span className="text-[9px] text-slate-400 mt-1">{gstCertFile ? 'Ready to upload ✓' : 'Click to simulate PDF attachment'}</span>
                </div>
                {errors.gstCertFile && <p className="text-[10px] text-red-500 font-medium">{errors.gstCertFile}</p>}
              </div>

              <div className="space-y-2">
                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-wider">Certificate of Incorporation *</label>
                <div
                  className={`border-2 border-dashed rounded-2xl p-6 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-slate-50/50 ${incDocFile ? 'border-emerald-500 bg-emerald-50/10' : errors.incDocFile ? 'border-red-500 bg-red-50/5' : 'border-slate-200'}`}
                  onClick={() => {
                    setIncDocFile(`incorporation_doc_${legalName.toLowerCase().replace(/\s+/g, '_') || 'company'}.pdf`);
                    setErrors({ ...errors, incDocFile: '' });
                  }}
                >
                  <span className="text-xl mb-1.5">{incDocFile ? '📄' : '📁'}</span>
                  <span className="text-xs font-semibold text-slate-700">{incDocFile ? incDocFile : 'Attach Incorporation PDF'}</span>
                  <span className="text-[9px] text-slate-400 mt-1">{incDocFile ? 'Ready to upload ✓' : 'Click to simulate PDF attachment'}</span>
                </div>
                {errors.incDocFile && <p className="text-[10px] text-red-500 font-medium">{errors.incDocFile}</p>}
              </div>
            </div>

            {/* Industry Specific Fields */}
            {(industry === 'Pharma' || industry === 'FMCG' || industry === 'Liquor') && (
              <div className="border-t border-slate-100 pt-6 space-y-4">
                <div className="bg-[#00b074]/5 border border-[#00b074]/20 rounded-2xl p-4 flex items-start gap-3">
                  <span className="text-lg">🛡️</span>
                  <div>
                    <h4 className="text-xs font-bold text-[#003057] uppercase tracking-wide">Industry-Specific Compliance Requirements ({industry})</h4>
                    <p className="text-[10px] text-slate-500 mt-0.5">Your sector requires additional verification records prior to brand registry activation.</p>
                  </div>
                </div>

                {industry === 'Pharma' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">Drug License Number *</label>
                      <input
                        type="text"
                        value={pharmaDrugLicense}
                        onChange={(e) => setPharmaDrugLicense(e.target.value)}
                        placeholder="DL-1234567890"
                        className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-none text-slate-800 ${errors.pharmaDrugLicense ? 'border-red-500' : 'border-slate-200'}`}
                      />
                      {errors.pharmaDrugLicense && <p className="text-[10px] text-red-500 font-medium">{errors.pharmaDrugLicense}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">Drug License Copy PDF *</label>
                      <div
                        onClick={() => {
                          setPharmaDrugLicenseFile('pharma_drug_license.pdf');
                          setErrors({ ...errors, pharmaDrugLicenseFile: '' });
                        }}
                        className={`border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-slate-50/50 ${pharmaDrugLicenseFile ? 'border-emerald-500 bg-emerald-50/10' : errors.pharmaDrugLicenseFile ? 'border-red-500' : 'border-slate-200'}`}
                      >
                        <span className="text-xs font-semibold text-slate-700 truncate max-w-[180px]">{pharmaDrugLicenseFile ? pharmaDrugLicenseFile : 'Attach License PDF'}</span>
                        <span className="text-[9px] text-slate-400 mt-0.5">Click to simulate</span>
                      </div>
                      {errors.pharmaDrugLicenseFile && <p className="text-[10px] text-red-500 font-medium">{errors.pharmaDrugLicenseFile}</p>}
                    </div>
                  </div>
                )}

                {industry === 'FMCG' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-500">FSSAI License Number *</label>
                      <input
                        type="text"
                        value={fssaiLicense}
                        onChange={(e) => setFssaiLicense(e.target.value)}
                        placeholder="FSSAI-14-Digit-Code"
                        className={`w-full bg-slate-50 border rounded-xl px-4 py-3 text-sm focus:outline-none text-slate-800 ${errors.fssaiLicense ? 'border-red-500' : 'border-slate-200'}`}
                      />
                      {errors.fssaiLicense && <p className="text-[10px] text-red-500 font-medium">{errors.fssaiLicense}</p>}
                    </div>
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">FSSAI Certificate PDF *</label>
                      <div
                        onClick={() => {
                          setFssaiLicenseFile('fssai_compliance_certificate.pdf');
                          setErrors({ ...errors, fssaiLicenseFile: '' });
                        }}
                        className={`border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-slate-50/50 ${fssaiLicenseFile ? 'border-emerald-500 bg-emerald-50/10' : errors.fssaiLicenseFile ? 'border-red-500' : 'border-slate-200'}`}
                      >
                        <span className="text-xs font-semibold text-slate-700 truncate max-w-[180px]">{fssaiLicenseFile ? fssaiLicenseFile : 'Attach FSSAI PDF'}</span>
                        <span className="text-[9px] text-slate-400 mt-0.5">Click to simulate</span>
                      </div>
                      {errors.fssaiLicenseFile && <p className="text-[10px] text-red-500 font-medium">{errors.fssaiLicenseFile}</p>}
                    </div>
                  </div>
                )}

                {industry === 'Liquor' && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-end">
                    <div className="space-y-1.5">
                      <label className="block text-xs font-bold uppercase tracking-wider text-slate-400">State Excise License PDF *</label>
                      <div
                        onClick={() => {
                          setExciseLicenseFile('state_excise_compliance.pdf');
                          setErrors({ ...errors, exciseLicenseFile: '' });
                        }}
                        className={`border-2 border-dashed rounded-2xl p-4 flex flex-col items-center justify-center text-center cursor-pointer transition-all hover:bg-slate-50/50 ${exciseLicenseFile ? 'border-emerald-500 bg-emerald-50/10' : errors.exciseLicenseFile ? 'border-red-500' : 'border-slate-200'}`}
                      >
                        <span className="text-xs font-semibold text-slate-700 truncate max-w-[180px]">{exciseLicenseFile ? exciseLicenseFile : 'Attach Excise License PDF'}</span>
                        <span className="text-[9px] text-slate-400 mt-0.5">Click to simulate</span>
                      </div>
                      {errors.exciseLicenseFile && <p className="text-[10px] text-red-500 font-medium">{errors.exciseLicenseFile}</p>}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="flex justify-between items-center pt-6 border-t border-slate-100">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleBack}
                  className="border border-slate-200 hover:bg-slate-50 text-slate-500 font-semibold py-3.5 px-6 rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer"
                >
                  ← Back step
                </button>
                <button
                  type="button"
                  onClick={() => logout()}
                  style={{ border: '1px solid #ef4444', color: '#ef4444', backgroundColor: 'transparent' }}
                  className="hover:bg-red-50 font-bold px-4 py-2.5 rounded-xl text-xs uppercase tracking-wider transition-colors cursor-pointer select-none"
                >
                  Log Out
                </button>
              </div>
              <button
                type="button"
                onClick={startSimulation}
                style={{ backgroundColor: '#00b074', color: '#ffffff' }}
                className="hover:bg-[#009660] text-white font-extrabold py-3.5 px-10 rounded-xl text-xs uppercase tracking-wider transition-all cursor-pointer shadow-md"
              >
                Launch Verification System →
              </button>
            </div>
          </div>
        )}

        {/* Step 3: Simulation checks progress log */}
        {step === 3 && (
          <div className="space-y-8 py-8 animate-fadeIn text-center">
            <div className="flex flex-col items-center space-y-4">
              <div className="relative flex items-center justify-center">
                <div className="w-16 h-16 border-4 border-slate-100 rounded-full"></div>
                <div className="absolute w-16 h-16 border-4 border-[#00b074] border-t-transparent rounded-full animate-spin"></div>
                <span className="absolute text-xl">🛡️</span>
              </div>
              <div>
                <h3 className="text-xl font-bold text-[#003057]">Simulating Autonomous Audits</h3>
                <p className="text-xs text-slate-400 mt-1">Verifying legal credentials with institutional databases.</p>
              </div>
            </div>

            <div className="max-w-md mx-auto bg-slate-50 border border-slate-200/80 rounded-2xl p-6 text-left space-y-4.5 shadow-sm">
              {simulationLogs.map((log, idx) => (
                <div key={idx} className="flex items-center justify-between text-xs font-semibold gap-4">
                  <div className="flex items-center gap-3">
                    {log.status === 'success' ? (
                      <span className="text-emerald-500 text-sm">✓</span>
                    ) : log.status === 'loading' ? (
                      <div className="w-3.5 h-3.5 border-2 border-slate-200 border-t-[#00b074] rounded-full animate-spin"></div>
                    ) : (
                      <span className="text-slate-350 text-xs">•</span>
                    )}
                    <span className={log.status === 'success' ? 'text-slate-800' : log.status === 'loading' ? 'text-[#003057] font-bold' : 'text-slate-400 font-normal'}>
                      {log.label}
                    </span>
                  </div>
                  <span className={`text-[10px] uppercase tracking-wider font-bold ${log.status === 'success' ? 'text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200/50' : log.status === 'loading' ? 'text-[#003057] animate-pulse' : 'text-slate-350'}`}>
                    {log.status === 'success' ? 'Verified' : log.status === 'loading' ? 'Checking' : 'Queued'}
                  </span>
                </div>
              ))}
            </div>

            <p className="text-[10px] text-slate-400 font-normal">Please do not close or reload this window. Verifications finalize instantly.</p>
          </div>
        )}
      </div>
    </div>
  );
}
