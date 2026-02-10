// seedCategories.ts
import mongoose, { Types } from "mongoose";
import { Category } from "./models/Category";
import { env } from "./config/env";

// ============================
// Types
// ============================
interface SeedCategory {
  code: string;
  title: string;
  level: number;
  parentCode?: string;
}

type CreatedCategoryMap = Record<
  string,
  {
    _id: Types.ObjectId;
  }
>;

// ============================
// Categories Data
// ============================
const categories: SeedCategory[] = [
  // ============================
  // A. CORE BUSINESS / MANDATE
  // ============================
  { code: "A", title: "CORE BUSINESS / MANDATE PERSPECTIVE", level: 1 },

  // Level 3 items from A.1 now point directly to A and become Level 2
  {
    code: "A.1.1",
    title: "Improve proximity to courts",
    parentCode: "A", // Changed from A.1 to A
    level: 2,        // Shifted level up
  },
  {
    code: "A.1.1.a",
    title: "Operationalize 1 High Court sub-registries",
    parentCode: "A.1.1",
    level: 3,        // Shifted level up
  },

  {
    code: "A.1.2",
    title: "Enhance Efficiency in Determination of Special Bench Cases",
    parentCode: "A", // Changed from A.1 to A
    level: 2,
  },
  {
    code: "A.1.2.a",
    title: "Facilitate approved special benches activities within 14 days",
    parentCode: "A.1.2",
    level: 3,
  },
  {
    code: "A.1.2.b",
    title: "Prepare and submit annual status report on High Court Special Benches",
    parentCode: "A.1.2",
    level: 3,
  },
  {
    code: "A.1.2.c",
    title: "Facilitate gazettement of records for destruction/disposal",
    parentCode: "A.1.2",
    level: 3,
  },

  {
    code: "A.1.3",
    title: "Facilitate ICT Infrastructure & Modernize Registry Records",
    parentCode: "A", // Changed from A.1 to A
    level: 2,
  },
  {
    code: "A.1.3.a",
    title: "Liaise with DICT to provide ICT equipment based on needs",
    parentCode: "A.1.3",
    level: 3,
  },
  {
    code: "A.1.3.b",
    title: "Update ICT equipment needs as requested",
    parentCode: "A.1.3",
    level: 3,
  },
  {
    code: "A.1.3.c",
    title: "Follow up with DICT on ICT equipment facilitation",
    parentCode: "A.1.3",
    level: 3,
  },

  {
    code: "A.1.4",
    title: "Expand the Doorways of Justice",
    parentCode: "A",
    level: 2,
  },
  {
    code: "A.1.4.a",
    title: "Liaise with AJS Secretariat to provide AJS registers",
    parentCode: "A.1.4",
    level: 3,
  },
  {
    code: "A.1.4.b",
    title: "Facilitate all approved circuits",
    parentCode: "A.1.4",
    level: 3,
  },
  {
    code: "A.1.4.c",
    title: "Facilitate handling of Taxation Matters upon approval",
    parentCode: "A.1.4",
    level: 3,
  },
  {
    code: "A.1.4.d",
    title: "Develop needs assessment report for ADRs & legal researchers",
    parentCode: "A.1.4",
    level: 3,
  },
  {
    code: "A.1.4.e",
    title: "Facilitate service weeks and RRIs",
    parentCode: "A.1.4",
    level: 3,
  },

  {
    code: "A.1.5",
    title: "Enhance Access to Legal Information",
    parentCode: "A",
    level: 2,
  },
  {
    code: "A.1.5.a",
    title: "Conduct sensitization on court processes at 10 High Court Stations",
    parentCode: "A.1.5",
    level: 3,
  },
  {
    code: "A.1.5.b",
    title: "Develop and disseminate IEC materials",
    parentCode: "A.1.5",
    level: 3,
  },
  {
    code: "A.1.5.c",
    title: "Publish 2000 Form 60 notices for succession matters",
    parentCode: "A.1.5",
    level: 3,
  },
  {
    code: "A.1.5.d",
    title: "Disseminate High Court Service Week Guidelines",
    parentCode: "A.1.5",
    level: 3,
  },
  {
    code: "A.1.5.e",
    title: "Ensure High Court information is at customer service desks",
    parentCode: "A.1.5",
    level: 3,
  },
  {
    code: "A.1.5.f",
    title: "Maintain and update the High Court website",
    parentCode: "A.1.5",
    level: 3,
  },

  {
    code: "A.1.6",
    title: "Enhance Access to Justice for Vulnerable Groups",
    parentCode: "A",
    level: 2,
  },
  {
    code: "A.1.6.a",
    title: "Develop draft High Court Service Delivery Charter in Kiswahili",
    parentCode: "A.1.6",
    level: 3,
  },
  {
    code: "A.1.6.b",
    title: "Sensitize stakeholders on vulnerable groups initiatives",
    parentCode: "A.1.6",
    level: 3,
  },
  {
    code: "A.1.6.c",
    title: "Coordinate payment of Pro-Bono fees",
    parentCode: "A.1.6",
    level: 3,
  },
  {
    code: "A.1.6.d",
    title: "Sensitize 100 officers on services for vulnerable groups",
    parentCode: "A.1.6",
    level: 3,
  },

  {
    code: "A.1.7",
    title: "Champion High Court Justice Reforms",
    parentCode: "A",
    level: 2,
  },
  {
    code: "A.1.7.a",
    title: "Facilitate report on criminal justice reform",
    parentCode: "A.1.7",
    level: 3,
  },
  {
    code: "A.1.7.b",
    title: "Develop guidelines for Kadhis sitting as assessors",
    parentCode: "A.1.7",
    level: 3,
  },

  {
    code: "A.1.8",
    title: "Promote Indigenous Social Justice Jurisprudence",
    parentCode: "A",
    level: 2,
  },
  {
    code: "A.1.8.a",
    title: "Track High Court cases referencing Indigenous laws",
    parentCode: "A.1.8",
    level: 3,
  },

  {
    code: "A.1.9",
    title: "Foster a Culture of Shared Leadership",
    parentCode: "A",
    level: 2,
  },
  {
    code: "A.1.9.a",
    title: "Ensure compliance with LMT guidelines",
    parentCode: "A.1.9",
    level: 3,
  },
  {
    code: "A.1.9.b",
    title: "Organize forum for PJs & Heads of Stations",
    parentCode: "A.1.9",
    level: 3,
  },
  {
    code: "A.1.9.c",
    title: "Organize annual best practices forum",
    parentCode: "A.1.9",
    level: 3,
  },
  {
    code: "A.1.9.d",
    title: "Facilitate meeting between PJ and Presiding Judges (HiCAC region)",
    parentCode: "A.1.9",
    level: 3,
  },
  {
    code: "A.1.9.e",
    title: "Facilitate meeting between PJ and Judges (HiCAC region)",
    parentCode: "A.1.9",
    level: 3,
  },
  {
    code: "A.1.9.f",
    title: "Facilitate meeting between Judiciary Spokesperson and Judges",
    parentCode: "A.1.9",
    level: 3,
  },

  {
    code: "A.1.10",
    title: "Enhance Strategic Partnerships & Collaboration",
    parentCode: "A",
    level: 2,
  },
  {
    code: "A.1.10.a",
    title: "Organize stakeholder symposium on access to justice",
    parentCode: "A.1.10",
    level: 3,
  },

  {
    code: "A.1.11",
    title: "Streamline Registry Operations",
    parentCode: "A",
    level: 2,
  },
  {
    code: "A.1.11.a",
    title: "Ensure registries have standardized registers",
    parentCode: "A.1.11",
    level: 3,
  },
  {
    code: "A.1.11.b",
    title: "Coordinate sensitization on Registry Manual",
    parentCode: "A.1.11",
    level: 3,
  },
  {
    code: "A.1.11.c",
    title: "Issue colour-coded file folders to 10 stations",
    parentCode: "A.1.11",
    level: 3,
  },
  {
    code: "A.1.11.d",
    title: "Facilitate typing & submission of appeal proceedings",
    parentCode: "A.1.11",
    level: 3,
  },
  {
    code: "A.1.11.e",
    title: "Sensitization on operations of Principal Registry",
    parentCode: "A.1.11",
    level: 3,
  },
  {
    code: "A.1.11.f",
    title: "Capacity building on preparation of 2nd appeals",
    parentCode: "A.1.11",
    level: 3,
  },
  {
    code: "A.1.11.g",
    title: "Facilitate gazettement of forfeiture notices within 30 days",
    parentCode: "A.1.11",
    level: 3,
  },

  {
    code: "A.1.12",
    title: "Provide Administrative Support to Judges & Courts",
    parentCode: "A",
    level: 2,
  },
  {
    code: "A.1.12.a",
    title: "Facilitate administrative requests & prepare quarterly reports",
    parentCode: "A.1.12",
    level: 3,
  },
  {
    code: "A.1.12.b",
    title: "Procure robes for 20 High Court Judges",
    parentCode: "A.1.12",
    level: 3,
  },
  {
    code: "A.1.12.c",
    title: "Submit quarterly administrative support reports to CRJ",
    parentCode: "A.1.12",
    level: 3,
  },
  {
    code: "A.1.12.d",
    title: "Develop draft High Court Administrative SOPs",
    parentCode: "A.1.12",
    level: 3,
  },
  {
    code: "A.1.12.e",
    title: "Provide technical support on budgeting to 15 stations",
    parentCode: "A.1.12",
    level: 3,
  },

  {
    code: "A.1.13",
    title: "Supervision of Deputy Registrars",
    parentCode: "A",
    level: 2,
  },
  {
    code: "A.1.13.a",
    title: "Conduct spot checks at 15 stations",
    parentCode: "A.1.13",
    level: 3,
  },
  {
    code: "A.1.13.b",
    title: "Follow up on quarterly reports from DSPOP",
    parentCode: "A.1.13",
    level: 3,
  },
  {
    code: "A.1.13.c",
    title: "Ensure proper maintenance & updating of court records",
    parentCode: "A.1.13",
    level: 3,
  },
  {
    code: "A.1.13.d",
    title: "Sensitize Deputy Registrars on registry management",
    parentCode: "A.1.13",
    level: 3,
  },
  {
    code: "A.1.13.e",
    title: "Facilitate 4 regional meetings with Deputy Registrars",
    parentCode: "A.1.13",
    level: 3,
  },

  {
    code: "A.1.14",
    title: "Maintenance of Infrastructure & Assets",
    parentCode: "A",
    level: 2,
  },
  {
    code: "A.1.14.a",
    title: "Update furniture needs assessment",
    parentCode: "A.1.14",
    level: 3,
  },
  {
    code: "A.1.14.b",
    title: "Update building rehabilitation needs assessment",
    parentCode: "A.1.14",
    level: 3,
  },
  {
    code: "A.1.14.c",
    title: "Follow up with directorates on needs assessment facilitation",
    parentCode: "A.1.14",
    level: 3,
  },

  {
    code: "A.1.15",
    title: "Timely Submission of Quarterly Management Reports",
    parentCode: "A",
    level: 2,
  },
  {
    code: "A.1.15.a",
    title: "Prepare & submit quarterly performance reports by 5th of next month",
    parentCode: "A.1.15",
    level: 3,
  },

  // ============================
  // B, C, D, E remain the same...
  // ============================
  { code: "B", title: "CUSTOMER PERSPECTIVE", level: 1 },
  {
    code: "B.1",
    title: "Compliance with Service Delivery Charter",
    parentCode: "B",
    level: 2,
  },
  {
    code: "B.1.a",
    title: "Disseminate the High Court Service Delivery Charter",
    parentCode: "B.1",
    level: 3,
  },
  {
    code: "B.1.b",
    title: "Monitor compliance with charter standards",
    parentCode: "B.1",
    level: 3,
  },
  {
    code: "B.2",
    title: "Customer Survey Recommendations",
    parentCode: "B",
    level: 2,
  },
  {
    code: "B.2.a",
    title: "Implement/follow up survey recommendations",
    parentCode: "B.2",
    level: 3,
  },

  { code: "C", title: "FINANCIAL PERSPECTIVE", level: 1 },
  {
    code: "C.1",
    title: "Compliance with budget level",
    parentCode: "C",
    level: 2,
  },
  {
    code: "C.1.a",
    title: "Ensure 100% absorption & PFM compliance",
    parentCode: "C.1",
    level: 3,
  },
  {
    code: "C.2",
    title: "Implementation of Audit Report Recommendations",
    parentCode: "C",
    level: 2,
  },
  {
    code: "C.2.a",
    title: "Implement all final audit recommendations",
    parentCode: "C.2",
    level: 3,
  },
  {
    code: "C.2.b",
    title: "Respond to station audit recommendations",
    parentCode: "C.2",
    level: 3,
  },
  { code: "C.3", title: "Greening Initiatives", parentCode: "C", level: 2 },
  {
    code: "C.3.a",
    title: "Implement paperless initiatives",
    parentCode: "C.3",
    level: 3,
  },
  {
    code: "C.3.b",
    title: "Implement energy saving initiatives",
    parentCode: "C.3",
    level: 3,
  },

  { code: "D", title: "INNOVATION AND LEARNING PERSPECTIVE", level: 1 },
  {
    code: "D.1",
    title: "Service Improvement Innovations",
    parentCode: "D",
    level: 2,
  },
  {
    code: "D.1.a",
    title: "Replicate/adopt identified innovations",
    parentCode: "D.1",
    level: 3,
  },
  {
    code: "D.1.b",
    title: "Develop one new service delivery innovation",
    parentCode: "D.1",
    level: 3,
  },
  { code: "D.2", title: "Competency Development", parentCode: "D", level: 2 },
  {
    code: "D.2.a",
    title: "Identify training gaps & submit to JSTC",
    parentCode: "D.2",
    level: 3,
  },
  {
    code: "D.2.b",
    title: "Conduct in-house training on services for vulnerable groups",
    parentCode: "D.2",
    level: 3,
  },

  { code: "E", title: "INTERNAL PROCESSES", level: 1 },
  { code: "E.1", title: "Corruption eradication", parentCode: "E", level: 2 },
  {
    code: "E.1.a",
    title: "Sensitize staff on dangers of corruption",
    parentCode: "E.1",
    level: 3,
  },
  {
    code: "E.1.b",
    title: "Document & maintain records of corruption reports",
    parentCode: "E.1",
    level: 3,
  },
  {
    code: "E.1.c",
    title: "Implement recommendations from corruption surveys & audits",
    parentCode: "E.1",
    level: 3,
  },
  {
    code: "E.1.d",
    title: "Implement strategies addressing corruption issues",
    parentCode: "E.1",
    level: 3,
  },
  {
    code: "E.2",
    title: "Improve Employee Wellness",
    parentCode: "E",
    level: 2,
  },
  {
    code: "E.2.a",
    title: "Maintain staff welfare program",
    parentCode: "E.2",
    level: 3,
  },
  {
    code: "E.2.b",
    title: "Organize one team-building event",
    parentCode: "E.2",
    level: 3,
  },
  {
    code: "E.3",
    title: "Enhance Employee Satisfaction & Work Environment",
    parentCode: "E",
    level: 2,
  },
  {
    code: "E.3.a",
    title: "Hold quarterly staff meetings",
    parentCode: "E.3",
    level: 3,
  },
  {
    code: "E.3.b",
    title: "Implement recommendations from Employee Satisfaction Survey",
    parentCode: "E.3",
    level: 3,
  },
];

// ============================
// Seeder Logic (remains unchanged)
// ============================
(async (): Promise<void> => {
  try {
    if (!env.MONGO_URI) {
      throw new Error("❌ MONGO_URI is missing");
    }

    await mongoose.connect(env.MONGO_URI);
    console.log("✅ MongoDB connected");

    await Category.deleteMany({});

    const createdCategories: CreatedCategoryMap = {};

    for (const cat of categories) {
      const parentId = cat.parentCode
        ? createdCategories[cat.parentCode]?._id
        : undefined;

      const newCategory = new Category({
        code: cat.code,
        title: cat.title,
        level: cat.level,
        parent: parentId,
      });

      await newCategory.save();

      createdCategories[cat.code] = {
        _id: newCategory._id,
      };
    }

    console.log("✅ Categories seeded successfully!");
    process.exit(0);
  } catch (error) {
    console.error("❌ Error seeding categories:", error);
    process.exit(1);
  }
})();