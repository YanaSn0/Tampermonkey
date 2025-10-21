# Upgrade pip globally
python -m pip install --upgrade pip

# The cleanest fix is to give it the compatibility shim
pip install tf-keras

# Install FastAPI + Uvicorn
pip install fastapi uvicorn

# Install Hugging Face Transformers + PyTorch
pip install transformers torch

# Install Pillow (image processing)
pip install pillow

# Optional: CORS support
pip install fastapi[all]

# Run your server globally
cd $HOME
uvicorn class:app --reload --port 8000
