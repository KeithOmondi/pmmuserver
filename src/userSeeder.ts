import mongoose from "mongoose";
import bcrypt from "bcrypt";
import { env } from "./config/env";
import { User } from "./models/User";

// Staff list
const staff = [
  {
    name: "Hon. Clara Otieno- Omondi",
    pjNumber: "43244",
    email: "claraotieno23@gmail.com",
  },
  {
    name: "Lavenda Awuor Ochieng",
    pjNumber: "74693",
    email: "lavenda.ochieng@court.go.ke",
  },
  {
    name: "Hon. Jane Kemunto Ocharo",
    pjNumber: "58485",
    email: "ocharo.jane@gmail.com",
  },
  {
    name: "Hon. Linda Mumassabba",
    pjNumber: "57316",
    email: "lindamuma7@gmail.com",
  },
  {
    name: "Hon. Jeffrey Sagirai",
    pjNumber: "81483",
    email: "jeffrey.sagirai@gmail.com",
  },
  {
    name: "Hon. Edith Malizu Gwaliamba",
    pjNumber: "46446",
    email: "edithmalizu@gmail.com",
  },

  {
    name: "Joslyne Kathure Ndubi",
    pjNumber: "56394",
    email: "joslynekathure@gmail.com",
  },
  { name: "Duncan Odima", pjNumber: "27311", email: "odymadd@gmail.com" },
  {
    name: "Bernard Kimondo N.",
    pjNumber: "32201",
    email: "benkimondo1@gmail.com",
  },
  { name: "Irene Njuguna", pjNumber: "44282", email: "wambuisizwe@gmail.com" },
  {
    name: "Dennis Isoe",
    pjNumber: "37293",
    email: "johnpaulopenda2005@gmail.com",
  },
  { name: "Eunice W. Kamau", pjNumber: "81524", email: "kuiekamau@gmail.com" },
  {
    name: "Elizabeth Angara",
    pjNumber: "35534",
    email: "elizaangara@gmail.com",
  },
  {
    name: "Everline Mbetera",
    pjNumber: "65440",
    email: "evambetera@gmail.com",
  },
  { name: "Esther Kasina", pjNumber: "22400", email: "essykasina@gmail.com" },
  {
    name: "Maureen Atieno Oduor",
    pjNumber: "80384",
    email: "moryn007@gmail.com",
  },
  { name: "Kevin Omondi", pjNumber: "80224", email: "kevomosh08@gmail.com" },
  {
    name: "Margaret Wakuhi Kahura",
    pjNumber: "74732",
    email: "margaretwakuhi@yahoo.com",
  },
  {
    name: "Agnella Mwakisha",
    pjNumber: "69541",
    email: "agnellamwakisha@gmail.com",
  },
  
  { name: "James Kamotho", pjNumber: "66242", email: "jimkamau177@gmail.com" },

  {
    name: "Cynthia Atieno",
    pjNumber: "68870",
    email: "cynthia.atieno06@gmail.com",
  },
  {
    name: "Ken Okello Otieno",
    pjNumber: "50487",
    email: "kenokello8@gmail.com",
  },
  {
    name: "Beatrice Nanjala Wanyonyi",
    pjNumber: "64630",
    email: "bettyanjela790@gmail.com",
  },
  { name: "Nancy Khavetsa", pjNumber: "54423", email: "nkhavetsa25@gmail.com" },
  {
    name: "Elizabeth Mwangi (Driver)",
    pjNumber: "59059",
    email: "lizmwangi0580@gmail.com",
  },
  {
    name: "Samuel Onyango",
    pjNumber: "82421",
    email: "samuelonyango263@gmail.com",
  },
  {
    name: "Dennis Keith Omondi",
    pjNumber: "00045",
    email: "denniskeith62@gmail.com",
  },
  {
    name: "Britney Achieng Ouma",
    pjNumber: "000132",
    email: "oumabritney@gmail.com",
  },

  {
    name: "Emily Masawa",
    pjNumber: "47688",
    email: "emily.masawa@court.go.ke",
  },

   {
    name: "Lilian Udoto",
    pjNumber: "56459",
    email: "udotol@yahoo.co.uk",
  },

  {
    name: "Hon. Shimenga",
    pjNumber: "57641",
    email: "iberiam777@gmail.com",
  },
];

// ... existing imports

const seedUsers = async () => {
  try {
    if (!env.MONGO_URI) throw new Error("❌ MONGO_URI is missing");

    await mongoose.connect(env.MONGO_URI);
    console.log("✅ MongoDB connected");

    for (let i = 0; i < staff.length; i++) {
      const s = staff[i];

      let role: "SuperAdmin" | "Admin" | "User" = "User";
      if (i === 0) role = "SuperAdmin";
      else if (i === 1) role = "Admin";

      const hashedPassword = await bcrypt.hash(s.pjNumber, 10);

      await User.updateOne(
        { $or: [{ email: s.email.toLowerCase() }, { pjNumber: s.pjNumber }] },
        {
          $setOnInsert: {
            name: s.name,
            email: s.email.toLowerCase(),
            pjNumber: s.pjNumber,
            password: hashedPassword,
            role,
            tokenVersion: 0, // Set for new users
            accountLocked: true, // Matching your schema default
          },
          // Optional: If you want to ensure existing users get the field
          $set: { lastActivityAt: new Date() } 
        },
        { upsert: true }
      );

      console.log(`Processed: ${s.name} (${role})`);
    }

    // IMPORTANT: Migration for existing users who might lack the field
    const migrationResult = await User.updateMany(
      { tokenVersion: { $exists: false } },
      { $set: { tokenVersion: 0 } }
    );
    
    if (migrationResult.modifiedCount > 0) {
      console.log(`🛠️ Migrated ${migrationResult.modifiedCount} existing users to tokenVersion: 0`);
    }

    console.log("✅ All users seeded and synchronized successfully");
    process.exit(0);
  } catch (err) {
    console.error("Seeder error:", err);
    process.exit(1);
  }
};

seedUsers();
