// GENERATED from the frozen legacy source — do not hand-edit.
// Source: ../BYA& Keiri/bya-new/src/lib/india.js
// Feature inventory §19: India states/UTs and their major cities.
// Regenerate rather than retype: transcription is how hand-curated data is lost.

/**
 * All 36 states and union territories.
 *
 * Used for registration dropdowns and, later, for accountant/business matching
 * by location.
 */
export const INDIA_STATES = [
  "Andhra Pradesh",
  "Arunachal Pradesh",
  "Assam",
  "Bihar",
  "Chhattisgarh",
  "Goa",
  "Gujarat",
  "Haryana",
  "Himachal Pradesh",
  "Jharkhand",
  "Karnataka",
  "Kerala",
  "Madhya Pradesh",
  "Maharashtra",
  "Manipur",
  "Meghalaya",
  "Mizoram",
  "Nagaland",
  "Odisha",
  "Punjab",
  "Rajasthan",
  "Sikkim",
  "Tamil Nadu",
  "Telangana",
  "Tripura",
  "Uttar Pradesh",
  "Uttarakhand",
  "West Bengal",
  "Andaman and Nicobar Islands",
  "Chandigarh",
  "Dadra and Nagar Haveli and Daman and Diu",
  "Delhi",
  "Jammu and Kashmir",
  "Ladakh",
  "Lakshadweep",
  "Puducherry",
] as const;

/**
 * Major cities per state/UT — suggestions, not a closed set.
 *
 * The legacy UI renders these in a datalist, so a user may type any city. That
 * is deliberate: India has thousands of towns and a closed list would block
 * real businesses from registering.
 */
export const CITIES_BY_STATE: Readonly<Record<string, readonly string[]>> = {
  "Andhra Pradesh": [
    "Visakhapatnam",
    "Vijayawada",
    "Guntur",
    "Nellore",
    "Tirupati",
    "Kurnool",
    "Rajahmundry",
  ],
  "Arunachal Pradesh": ["Itanagar", "Naharlagun", "Pasighat"],
  Assam: ["Guwahati", "Silchar", "Dibrugarh", "Jorhat", "Nagaon", "Tezpur"],
  Bihar: ["Patna", "Gaya", "Bhagalpur", "Muzaffarpur", "Darbhanga", "Purnia"],
  Chhattisgarh: ["Raipur", "Bhilai", "Bilaspur", "Korba", "Durg"],
  Goa: ["Panaji", "Margao", "Vasco da Gama", "Mapusa"],
  Gujarat: ["Ahmedabad", "Surat", "Vadodara", "Rajkot", "Bhavnagar", "Jamnagar", "Gandhinagar"],
  Haryana: ["Gurugram", "Faridabad", "Panipat", "Ambala", "Karnal", "Hisar", "Rohtak"],
  "Himachal Pradesh": ["Shimla", "Solan", "Dharamshala", "Mandi", "Baddi"],
  Jharkhand: ["Ranchi", "Jamshedpur", "Dhanbad", "Bokaro", "Deoghar"],
  Karnataka: ["Bengaluru", "Mysuru", "Hubballi", "Mangaluru", "Belagavi", "Davangere"],
  Kerala: ["Thiruvananthapuram", "Kochi", "Kozhikode", "Thrissur", "Kollam", "Kannur"],
  "Madhya Pradesh": ["Indore", "Bhopal", "Jabalpur", "Gwalior", "Ujjain", "Sagar"],
  Maharashtra: [
    "Mumbai",
    "Pune",
    "Nagpur",
    "Nashik",
    "Aurangabad",
    "Thane",
    "Navi Mumbai",
    "Solapur",
  ],
  Manipur: ["Imphal", "Thoubal"],
  Meghalaya: ["Shillong", "Tura"],
  Mizoram: ["Aizawl", "Lunglei"],
  Nagaland: ["Kohima", "Dimapur"],
  Odisha: ["Bhubaneswar", "Cuttack", "Rourkela", "Berhampur", "Sambalpur"],
  Punjab: ["Ludhiana", "Amritsar", "Jalandhar", "Patiala", "Bathinda", "Mohali"],
  Rajasthan: ["Jaipur", "Jodhpur", "Udaipur", "Kota", "Ajmer", "Bikaner"],
  Sikkim: ["Gangtok", "Namchi"],
  "Tamil Nadu": [
    "Chennai",
    "Coimbatore",
    "Madurai",
    "Tiruchirappalli",
    "Salem",
    "Tirunelveli",
    "Erode",
  ],
  Telangana: ["Hyderabad", "Warangal", "Nizamabad", "Karimnagar", "Khammam"],
  Tripura: ["Agartala", "Udaipur"],
  "Uttar Pradesh": [
    "Lucknow",
    "Kanpur",
    "Ghaziabad",
    "Agra",
    "Noida",
    "Greater Noida",
    "Varanasi",
    "Meerut",
    "Prayagraj",
    "Bareilly",
  ],
  Uttarakhand: ["Dehradun", "Haridwar", "Roorkee", "Haldwani", "Rishikesh"],
  "West Bengal": ["Kolkata", "Howrah", "Durgapur", "Asansol", "Siliguri"],
  "Andaman and Nicobar Islands": ["Port Blair"],
  Chandigarh: ["Chandigarh"],
  "Dadra and Nagar Haveli and Daman and Diu": ["Daman", "Silvassa", "Diu"],
  Delhi: ["New Delhi", "Delhi", "Dwarka", "Rohini", "Saket"],
  "Jammu and Kashmir": ["Srinagar", "Jammu", "Anantnag", "Baramulla"],
  Ladakh: ["Leh", "Kargil"],
  Lakshadweep: ["Kavaratti"],
  Puducherry: ["Puducherry", "Karaikal"],
};

export type IndiaState = (typeof INDIA_STATES)[number];
