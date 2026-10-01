// US-only filter: drop stories that are about another country and have no US angle.
const FOREIGN = [
  // countries (ambiguous ones like Georgia, Jordan, Turkey, Chad, Niger omitted on purpose)
  'Canada', 'Mexico', 'United Kingdom', 'Britain', 'England', 'Scotland', 'Wales', 'Ireland', 'France', 'Germany', 'Italy', 'Spain', 'Portugal',
  'Netherlands', 'Belgium', 'Switzerland', 'Austria', 'Sweden', 'Norway', 'Denmark', 'Finland', 'Poland', 'Ukraine', 'Russia', 'Belarus',
  'Hungary', 'Romania', 'Greece', 'Serbia', 'Croatia', 'Czech Republic', 'Israel', 'Gaza', 'West Bank', 'Lebanon', 'Syria', 'Iraq', 'Iran',
  'Yemen', 'Saudi Arabia', 'Qatar', 'United Arab Emirates', 'UAE', 'Dubai', 'Egypt', 'Libya', 'Sudan', 'Ethiopia', 'Somalia', 'Kenya', 'Nigeria',
  'South Africa', 'Congo', 'Afghanistan', 'Pakistan', 'India', 'Bangladesh', 'Sri Lanka', 'Nepal', 'China', 'Hong Kong', 'Taiwan', 'Japan',
  'South Korea', 'North Korea', 'Vietnam', 'Thailand', 'Myanmar', 'Cambodia', 'Philippines', 'Indonesia', 'Malaysia', 'Singapore', 'Australia',
  'New Zealand', 'Brazil', 'Argentina', 'Colombia', 'Venezuela', 'Peru', 'Chile', 'Ecuador', 'Bolivia', 'Haiti', 'Cuba', 'Guatemala', 'Honduras',
  'El Salvador', 'Nicaragua', 'Jamaica', 'Dominican Republic', 'Kazakhstan', 'Armenia', 'Azerbaijan', 'Bahrain', 'Kuwait', 'Oman', 'Tunisia',
  'Algeria', 'Morocco', 'Ghana', 'Uganda', 'Rwanda', 'Zimbabwe', 'Mozambique', 'Mali', 'Burkina Faso', 'Iceland', 'Estonia', 'Latvia', 'Lithuania',
  'Moldova', 'Slovakia', 'Slovenia', 'Bulgaria', 'Kosovo', 'Bosnia',
  // cities
  'London', 'Manchester', 'Liverpool', 'Paris', 'Berlin', 'Munich', 'Rome', 'Milan', 'Madrid', 'Barcelona', 'Lisbon', 'Amsterdam', 'Brussels',
  'Geneva', 'Vienna', 'Stockholm', 'Oslo', 'Copenhagen', 'Warsaw', 'Kyiv', 'Kiev', 'Kharkiv', 'Odesa', 'Moscow', 'St. Petersburg', 'Jerusalem',
  'Tel Aviv', 'Beirut', 'Damascus', 'Baghdad', 'Tehran', 'Riyadh', 'Doha', 'Cairo', 'Istanbul', 'Ankara', 'Karachi', 'Lahore', 'Islamabad',
  'Kabul', 'New Delhi', 'Delhi', 'Mumbai', 'Bangalore', 'Bengaluru', 'Kolkata', 'Chennai', 'Dhaka', 'Beijing', 'Shanghai', 'Shenzhen', 'Guangzhou',
  'Tokyo', 'Osaka', 'Seoul', 'Pyongyang', 'Taipei', 'Manila', 'Jakarta', 'Bangkok', 'Hanoi', 'Sydney', 'Melbourne', 'Auckland', 'Toronto',
  'Vancouver', 'Montreal', 'Ottawa', 'Calgary', 'Edmonton', 'Winnipeg', 'Quebec', 'Ontario', 'Alberta', 'British Columbia', 'Mexico City',
  'Guadalajara', 'Monterrey', 'Tijuana', 'Cancun', 'Havana', 'Bogota', 'Caracas', 'Lima', 'Santiago', 'Buenos Aires', 'Sao Paulo', 'São Paulo',
  'Rio de Janeiro', 'Lagos', 'Nairobi', 'Johannesburg', 'Cape Town', 'Addis Ababa', 'Khartoum', 'Tripoli', 'Kathmandu', 'Colombo', 'Yangon',
  // demonyms / groups
  'British', 'Canadian', 'Mexican', 'French', 'German', 'Italian', 'Spanish', 'Ukrainian', 'Russian', 'Israeli', 'Palestinian', 'Iranian',
  'Iraqi', 'Syrian', 'Lebanese', 'Saudi', 'Yemeni', 'Egyptian', 'Chinese', 'Japanese', 'South Korean', 'North Korean', 'Taiwanese', 'Indian',
  'Pakistani', 'Afghan', 'Australian', 'Brazilian', 'Argentine', 'Venezuelan', 'Colombian', 'Haitian', 'Cuban', 'Nigerian', 'Kenyan',
  'Hamas', 'Hezbollah', 'Houthi', 'Houthis', 'Taliban', 'Kremlin', 'Putin', 'Zelensky', 'Netanyahu', 'Xi Jinping', 'Downing Street',
  'First Nations', 'Premier League', 'Bundesliga', 'La Liga', 'Serie A', 'Champions League', 'Scotland Yard', 'Royal Family', 'King Charles',
  'Prince William', 'Prince Harry', 'Kate Middleton', 'European Union', 'EU', 'NATO', 'United Nations', 'WHO',
];
const US_STATES = 'Alabama|Alaska|Arizona|Arkansas|California|Colorado|Connecticut|Delaware|Florida|Georgia|Hawaii|Idaho|Illinois|Indiana|Iowa|Kansas|Kentucky|Louisiana|Maine|Maryland|Massachusetts|Michigan|Minnesota|Mississippi|Missouri|Montana|Nebraska|Nevada|New Hampshire|New Jersey|New Mexico|New York|North Carolina|North Dakota|Ohio|Oklahoma|Oregon|Pennsylvania|Rhode Island|South Carolina|South Dakota|Tennessee|Texas|Utah|Vermont|Virginia|Washington|West Virginia|Wisconsin|Wyoming';
const US_RX = new RegExp(`(?<!\\w)(U\\.S\\.|US|USA|U\\.S\\.A\\.|United States|America|American|Americans|nationwide|federal|Congress|Senate|House Republicans|House Democrats|White House|Pentagon|FBI|FDA|CDC|NHTSA|CPSC|FTC|FCC|DOJ|Supreme Court|NFL|NBA|MLB|NHL|WNBA|NCAA|Chicago|Chicagoland|DuPage|Naperville|Wheaton|Los Angeles|New York City|NYC|Houston|Dallas|Miami|Atlanta|Boston|Seattle|Denver|Phoenix|Detroit|Philadelphia|Las Vegas|San Francisco|Orlando|Nashville|${US_STATES})(?!\\w)`);
const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const FOREIGN_RX = new RegExp(`(?<!\\w)(${FOREIGN.map(esc).join("|")})(?!\\w)`);

/** true when a story is about another country with no US angle. */
// General news: foreign place anywhere. Brand/product stories: only when the headline itself is about another country.
export function isForeignOnly(title = '', summary = '', category = 'news') {
  const all = `${title}. ${summary}`;
  const probe = ['news', 'dupage'].includes(category) ? all : title;
  if (!FOREIGN_RX.test(probe)) return false;
  return !US_RX.test(all);
}
