# UVM FabLab 3D Printer Scheduler
# To visit the active site:
It can be found at: https://fablab.w3.uvm.edu
To explore the site use a general vistor account (name `github`, PIN `0319`)


A web app built for the [UVM SEED Program](https://www.uvm.edu/seed) to manage student access to self-serve 3D printers in the UVM FabLab. It handles training certification tracking, printer reservations, and user management, and is deployed on UVM's Silk shared hosting following [ETS documentation](https://silk.uvm.edu/manual/nodejs/#web-applications).

## About

The UVM FabLab gives students access to digital fabrication tools including 3D printers. The SEED (Social Entrepreneurship, Engagement, and Design) Program supports student-led projects at UVM. This app was built to replace a manual sign-up process and make self-serve printer access easier to manage.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js 24 (LTS) via UVM Silk |
| Framework | Express.js |
| Database | SQLite via better-sqlite3 |
| Auth | JWT + bcrypt PIN authentication |
| Frontend | Vanilla HTML/CSS/JS |
| Server | NGINX Unit (managed by UVM Silk) |

## Training Process

Students need to complete training before they can book a printer.

1. Watch `FablabSeedTraining.mp4` to learn the basics of 3D printing and safe printer use
2. Complete the [UVM FabLab Self-Serve Training Quiz]() and score 80% or higher
3. Receive an email within 2 business days with a link to sign up for an in-person training session

After completing in-person training, an admin activates their account in this system.

## User Roles

| Role | What they can do |
|------|-----------------|
| `admin` | Manage users, printers, and all bookings |
| `user` | Make, edit, and cancel their own reservations |
| `read` | View the schedule only |

## Adding Users

Users are added by an admin through the web interface. You need a name, PIN, and role. Email is optional. Names are matched case-insensitively with spaces ignored, so "Anne Mara" and "annemara" will both work at login.

A default admin account (name `Admin`, PIN `1234`) is created on first run. Change the PIN immediately. Util 

## Printers

The four printers are named Leonardo, Donatello, Raphael, and Michelangelo. Each reservation gets a unique ID in the format `FBL-XXXXX-Y0`. Admins can set each printer to `online`, `offline`, or `maintenance`.

## Deployment (UVM Silk)

Deployed per the [ETS Node.js documentation](https://silk.uvm.edu/manual/nodejs/#web-applications) using NGINX Unit. The `.silk.ini` config:

```ini
[app]
type = nodejs
uri = /*
document-root = public
startup-script = server.js

[nodejs]
version = 24
```

To reload after changes:
```bash
silk app fablab.w3.uvm.edu/* load
```

To check logs:
```bash
tail -f /var/opt/nginx-unit/fablab/unit.log
```

## Running Locally

```bash
git clone https://github.com/aemara04/fablab.git
cd fablab
npm install
node server.js
```

Open [http://localhost:3000](http://localhost:3000). The database is created automatically at `data/bookings.db` on first run.

`node_modules/` and `data/` are in `.gitignore`. Run `npm install` after cloning. Do not commit the `data/` directory since it contains user records.
