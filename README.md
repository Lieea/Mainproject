# Vehicle Pollution Dashboard (Flask)

Quick setup and run instructions for this project.

Prerequisites
- Python 3.x installed and on PATH

Setup (recommended using a virtual environment)

```powershell
cd C:\Users\Acer\project
python -m venv venv
.\venv\Scripts\Activate.ps1
python -m pip install --upgrade pip setuptools wheel
pip install -r requirements.txt
python app.py
```

If PowerShell blocks activation, run:

```powershell
Set-ExecutionPolicy -Scope CurrentUser -ExecutionPolicy RemoteSigned -Force
.\venv\Scripts\Activate.ps1
```

If `python` is not found after installation, disable the Microsoft Store aliases:

1. Open Settings → Apps → Advanced app execution aliases
2. Turn OFF `python.exe` and `python3.exe`

Then re-open PowerShell and retry the commands above.

App will be available at http://127.0.0.1:5000/ when running.
