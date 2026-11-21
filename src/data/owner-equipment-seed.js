const rentalPeriodDays = {
  daily: 1,
  weekly: 7,
  monthly: 30,
};

const toolsImage = "/images/tools-rental-banner.jpg";
const equipmentImage = "/images/equipment-rental-banner.jpg";
const eventImage = "/images/construction-team-banner.jpg";

function createListing(details) {
  const priceMinor = Math.round(details.rentalPrice * 100);
  const dailyRate =
    Math.max(1, Math.round(priceMinor / rentalPeriodDays[details.rentalType])) /
    100;

  return { ...details, dailyRate };
}

export const ownerEquipmentSeed = [
  createListing({
    name: "Cordless Drill and Impact Driver Kit",
    category: "Construction Equipment",
    location: "Dhaka",
    rentalPrice: 650,
    rentalType: "daily",
    quantity: 3,
    condition: "Excellent",
    brand: "Bosch",
    model: "GSR 18V-50 Combo",
    image: toolsImage,
    description:
      "A two-tool cordless set for drilling and fastening during home renovations, furniture assembly, and light construction.",
    rentalTerms:
      "Return both tools, two batteries, charger, and carrying case. Report damaged or missing parts at return.",
  }),
  createListing({
    name: "Rotary Hammer Drill with Bit Set",
    category: "Construction Equipment",
    location: "Chattogram",
    rentalPrice: 1000,
    rentalType: "daily",
    quantity: 2,
    condition: "Good",
    brand: "Makita",
    model: "HR2470",
    image: toolsImage,
    description:
      "A corded rotary hammer supplied with masonry bits for drilling anchor holes and carrying out repair work in concrete and brick.",
    rentalTerms:
      "Use suitable bits and eye protection. Clean the tool before return and include the side handle and bit case.",
  }),
  createListing({
    name: "5 kVA Portable Generator",
    category: "Construction Equipment",
    location: "Dhaka",
    rentalPrice: 2800,
    rentalType: "daily",
    quantity: 1,
    condition: "Good",
    brand: "Honda",
    model: "GP5500",
    image: equipmentImage,
    description:
      "A portable generator for temporary power at small work sites, outdoor events, and backup applications.",
    rentalTerms:
      "Operate outdoors in a ventilated area only. Return with the supplied cables and accessories; fuel is not included.",
  }),
  createListing({
    name: "140 Litre Concrete Mixer",
    category: "Construction Equipment",
    location: "Narayanganj",
    rentalPrice: 8000,
    rentalType: "weekly",
    quantity: 1,
    condition: "Good",
    brand: "Crown",
    model: "CMX-140",
    image: toolsImage,
    description:
      "A wheeled concrete mixer for preparing small batches of concrete and mortar for home-building and renovation projects.",
    rentalTerms:
      "Clean the drum after each use. Transport must be arranged by the renter; return the mixer with its wheels and safety guard.",
  }),
  createListing({
    name: "Aluminium Scaffold Tower, 6 Metres",
    category: "Construction Equipment",
    location: "Gazipur",
    rentalPrice: 6500,
    rentalType: "weekly",
    quantity: 2,
    condition: "Excellent",
    brand: "WorkPro",
    model: "AT-6M",
    image: eventImage,
    description:
      "A modular aluminium scaffold tower with platform and guard rails for indoor maintenance, painting, and finishing work.",
    rentalTerms:
      "Assemble on level ground and use all supplied braces and guard rails. Do not exceed the manufacturer's load rating.",
  }),
  createListing({
    name: "Mirrorless Camera Kit with 24-70 mm Lens",
    category: "Photography Equipment",
    location: "Dhaka",
    rentalPrice: 3500,
    rentalType: "daily",
    quantity: 1,
    condition: "Excellent",
    brand: "Sony",
    model: "Alpha 7 III Kit",
    image: equipmentImage,
    description:
      "A full-frame mirrorless camera kit for event, portrait, and product photography. Includes a standard zoom lens and battery.",
    rentalTerms:
      "Bring a compatible memory card. Keep the lens caps on when not in use and return the camera with all supplied accessories.",
  }),
  createListing({
    name: "70-200 mm Telephoto Zoom Lens",
    category: "Photography Equipment",
    location: "Sylhet",
    rentalPrice: 1800,
    rentalType: "daily",
    quantity: 1,
    condition: "Good",
    brand: "Canon",
    model: "EF 70-200 mm f/2.8L",
    image: equipmentImage,
    description:
      "A telephoto zoom lens suitable for sports, stage performances, portraits, and outdoor event photography.",
    rentalTerms:
      "Confirm camera-mount compatibility before booking. Return with hood, caps, and padded case.",
  }),
  createListing({
    name: "Two-Panel LED Video Light Kit",
    category: "Photography Equipment",
    location: "Dhaka",
    rentalPrice: 4500,
    rentalType: "weekly",
    quantity: 2,
    condition: "Excellent",
    brand: "Godox",
    model: "SL60W Duo Kit",
    image: equipmentImage,
    description:
      "A pair of continuous LED lights with stands and softboxes for interviews, product shoots, and small video productions.",
    rentalTerms:
      "Use indoors or keep the equipment dry. Return both lights, stands, softboxes, power cables, and carrying bags.",
  }),
  createListing({
    name: "Dual Handheld Wireless Microphone Set",
    category: "Event Equipment",
    location: "Khulna",
    rentalPrice: 1500,
    rentalType: "daily",
    quantity: 2,
    condition: "Good",
    brand: "Shure",
    model: "BLX288/SM58",
    image: eventImage,
    description:
      "A two-microphone wireless set for presentations, community programs, and small stage events.",
    rentalTerms:
      "Test the system before the event. Return the receiver, both microphones, power adapter, and supplied cables.",
  }),
  createListing({
    name: "Portable PA Speaker Pair",
    category: "Event Equipment",
    location: "Dhaka",
    rentalPrice: 2200,
    rentalType: "daily",
    quantity: 1,
    condition: "Excellent",
    brand: "JBL",
    model: "EON612 Pair",
    image: eventImage,
    description:
      "Two powered PA speakers for announcements, music playback, and small indoor or outdoor gatherings.",
    rentalTerms:
      "Keep speakers upright and dry during transport. Return both power cables and speaker covers.",
  }),
  createListing({
    name: "Compact Cargo Van",
    category: "Vehicles & Transportation",
    location: "Dhaka",
    rentalPrice: 6500,
    rentalType: "daily",
    quantity: 1,
    condition: "Good",
    brand: "Toyota",
    model: "HiAce",
    image: equipmentImage,
    description:
      "A cargo van for moving event supplies, shop inventory, tools, or household items within the city.",
    rentalTerms:
      "A valid driving licence and refundable security deposit are required. Renter pays fuel, tolls, and traffic fines.",
  }),
  createListing({
    name: "150 cc Commuter Motorcycle",
    category: "Vehicles & Transportation",
    location: "Rajshahi",
    rentalPrice: 1800,
    rentalType: "daily",
    quantity: 2,
    condition: "Good",
    brand: "Yamaha",
    model: "FZ-S FI",
    image: equipmentImage,
    description:
      "A fuel-efficient commuter motorcycle for local travel and errands. Helmet is included with each rental.",
    rentalTerms:
      "A valid motorcycle driving licence and refundable security deposit are required. Return with the same fuel level.",
  }),
  createListing({
    name: "Utility Trailer, 8 by 5 Feet",
    category: "Vehicles & Transportation",
    location: "Cumilla",
    rentalPrice: 5000,
    rentalType: "weekly",
    quantity: 1,
    condition: "Good",
    brand: "LoadMate",
    model: "UM-85",
    image: equipmentImage,
    description:
      "A compact utility trailer for transporting tools, furniture, landscaping supplies, and event equipment.",
    rentalTerms:
      "Confirm towing-vehicle compatibility before collection. Secure all loads and return the trailer clean with its hitch lock.",
  }),
  createListing({
    name: "Submersible Water Pump",
    category: "Agriculture Equipment",
    location: "Mymensingh",
    rentalPrice: 1500,
    rentalType: "daily",
    quantity: 3,
    condition: "Good",
    brand: "AquaFlow",
    model: "SP-2HP",
    image: toolsImage,
    description:
      "A portable submersible pump for draining flooded areas, emptying tanks, and moving water around a work site.",
    rentalTerms:
      "Use only within the pump's rated depth and liquid conditions. Keep the power connection dry and return the hose adapter.",
  }),
  createListing({
    name: "Petrol Brush Cutter",
    category: "Agriculture Equipment",
    location: "Bogra",
    rentalPrice: 1200,
    rentalType: "daily",
    quantity: 3,
    condition: "Excellent",
    brand: "Husqvarna",
    model: "143R-II",
    image: toolsImage,
    description:
      "A shoulder-mounted brush cutter for trimming grass and clearing weeds around gardens, fields, and property boundaries.",
    rentalTerms:
      "Wear the supplied face shield and harness. Return with the cutting guard and supplied tool kit; fuel is not included.",
  }),
  createListing({
    name: "Diesel Power Tiller",
    category: "Agriculture Equipment",
    location: "Rangpur",
    rentalPrice: 9000,
    rentalType: "weekly",
    quantity: 1,
    condition: "Good",
    brand: "VST",
    model: "130DI",
    image: toolsImage,
    description:
      "A compact power tiller for preparing small plots, mixing soil, and supporting seasonal field work.",
    rentalTerms:
      "Operator must be familiar with agricultural machinery. Check oil before use and return with the supplied attachments.",
  }),
  createListing({
    name: "4K Business Projector",
    category: "Electronics",
    location: "Dhaka",
    rentalPrice: 2500,
    rentalType: "daily",
    quantity: 2,
    condition: "Excellent",
    brand: "Epson",
    model: "EH-TW7100",
    image: equipmentImage,
    description:
      "A high-resolution projector for business presentations, training sessions, classrooms, and private screenings.",
    rentalTerms:
      "Allow the projector to cool before packing. Return with remote, power cable, HDMI cable, and padded case.",
  }),
  createListing({
    name: "Business Laptop, Core i7",
    category: "Electronics",
    location: "Chattogram",
    rentalPrice: 3200,
    rentalType: "daily",
    quantity: 2,
    condition: "Excellent",
    brand: "Dell",
    model: "Latitude 5540",
    image: equipmentImage,
    description:
      "A business laptop for short-term office work, training, presentations, and data-entry projects.",
    rentalTerms:
      "Return the laptop, charger, and carrying sleeve. Back up your work and sign out of personal accounts before return.",
  }),
  createListing({
    name: "Folding Chair Set, 20 Pieces",
    category: "Event Equipment",
    location: "Dhaka",
    rentalPrice: 1200,
    rentalType: "daily",
    quantity: 10,
    condition: "Good",
    brand: "EventPro",
    model: "FC-20",
    image: eventImage,
    description:
      "A set of twenty lightweight folding chairs for meetings, family events, training sessions, and community programs.",
    rentalTerms:
      "Return all twenty chairs folded and stacked. Renter arranges pickup and return transport.",
  }),
  createListing({
    name: "6 by 6 Metre Event Canopy Tent",
    category: "Event Equipment",
    location: "Barishal",
    rentalPrice: 2500,
    rentalType: "daily",
    quantity: 3,
    condition: "Good",
    brand: "EventPro",
    model: "CT-6X6",
    image: eventImage,
    description:
      "A large pop-up canopy for outdoor gatherings, market stalls, registration desks, and sheltered event seating.",
    rentalTerms:
      "Secure all tent legs with the supplied weights or stakes. Do not use in severe weather; return dry and packed in its bag.",
  }),
].map((listing) =>
  Object.freeze({
    ...listing,
    approvalStatus: "pending",
  }),
);
