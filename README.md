# Google Maps Zones Demo (Next.js)

This is a **demo project** built with [Next.js](https://nextjs.org) that showcases how to create, edit, and manage **zones (polygons)** on a Google Map using the [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript).

It provides an interactive UI where users can:

* Draw new zones directly on the map
* Edit existing zones
* Create zones manually via coordinates or an address
* Save zones locally in `localStorage`
* View details (name, description, color, creation/update date) for each zone

---

## ⚙️ Requirements

Before running the project, you **must** set a Google Maps API key with the Drawing library enabled.

Create a `.env.local` file in the root of the project with the following:

```bash
NEXT_PUBLIC_GOOGLE_MAPS_API_KEY=YOUR_API_KEY_HERE
```

---

## 🚀 Getting Started

Install dependencies:

```bash
npm install
# or
yarn install
# or
pnpm install
# or
bun install
```

Run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser to view the demo.

---

## 🗺️ Features

* **Google Maps Integration** via [`@googlemaps/js-api-loader`](https://www.npmjs.com/package/@googlemaps/js-api-loader)
* **Zone Drawing** with the Google Maps **Drawing Library**
* **Persistent Storage** using localStorage (`utils/storage.ts`)
* **UI Components** built with [shadcn/ui](https://ui.shadcn.com) and [lucide-react](https://lucide.dev/)
* **Editable Polygons** (toggle edit mode for shape adjustments)
* **Default Demo Zone** around UCF coordinates (as an example)
* **Manual Zone Creation** by coordinates or address lookup (via Google Maps Geocoder API)

---

## 📂 Project Structure

* `app/page.tsx` → Main map + zone manager UI
* `components/ui/*` → Reusable UI elements (buttons, inputs, dialogs)
* `types/zone.ts` → Zone type definitions
* `utils/storage.ts` → Save/load/delete zones from localStorage

---

## 🛠️ Technologies Used

* [Next.js](https://nextjs.org/) – React framework
* [TypeScript](https://www.typescriptlang.org/) – Type safety
* [Google Maps JavaScript API](https://developers.google.com/maps/documentation/javascript) – Maps, Drawing, Geocoding
* [@googlemaps/js-api-loader](https://www.npmjs.com/package/@googlemaps/js-api-loader) – API loader for Maps
* [shadcn/ui](https://ui.shadcn.com) – UI components
* [lucide-react](https://lucide.dev/) – Icons

---

## 📖 Learn More

* [Next.js Documentation](https://nextjs.org/docs) – Features and API
* [Google Maps JavaScript API Docs](https://developers.google.com/maps/documentation/javascript/tutorial) – Maps + Drawing library
* [Vercel Deployment](https://vercel.com/docs) – Deploy your Next.js app

---

## 🚢 Deploy on Vercel

The easiest way to deploy your app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme).

---

👉 This project is mainly for **demo/learning purposes**—to show how you can build a **zone management UI** on top of Google Maps inside a Next.js app.