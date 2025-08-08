# Cardiac Monitor & Defib Simulator

Educational simulator (React + Vite + TypeScript + Tailwind). Not a medical device.

## Local Run
```bash
npm install
npm run dev
```

## Build
```bash
npm run build
npm run preview
```

## Deploy to Vercel
1. Create a new GitHub repo and push this folder.
2. In Vercel, click **Add New → Project**, then **Import** your repo.
3. Vercel will auto-detect Vite:
   - Build Command: `npm run build`
   - Output Directory: `dist`
4. Click **Deploy**. You’ll get a URL (and optional custom domain).

## Notes
- Works on desktop and mobile browsers.
- Keyboard shortcuts: [Space]=Shock, [C]=Charge, [P]=Power, [N]=Next Case.
- Tailwind is used for styling; if you remove it, the UI will still function but look plain.