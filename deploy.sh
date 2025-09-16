#!/bin/bash

# STO Custom Journey Activity - Quick Deployment Script
# This script helps you deploy to Render.com or Vercel

echo "🚀 STO Custom Journey Activity - Deployment Helper"
echo "=================================================="

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📁 Initializing Git repository..."
    git init
    git add .
    git commit -m "Initial STO activity deployment"
    git branch -M main
    echo "✅ Git repository initialized"
else
    echo "📁 Git repository already exists"
fi

echo ""
echo "🌐 Choose your deployment platform:"
echo "1) Render.com (Recommended for Node.js)"
echo "2) Vercel (Good for serverless)"
echo "3) Manual setup instructions"
echo ""

read -p "Enter your choice (1-3): " choice

case $choice in
    1)
        echo ""
        echo "🎯 Deploying to Render.com"
        echo "========================="
        echo ""
        echo "📋 Steps to complete deployment:"
        echo "1. Push your code to GitHub:"
        echo "   git remote add origin https://github.com/yourusername/sto-activity.git"
        echo "   git push -u origin main"
        echo ""
        echo "2. Go to https://render.com and sign up with GitHub"
        echo "3. Click 'New +' → 'Web Service'"
        echo "4. Connect your GitHub repository"
        echo "5. Use these settings:"
        echo "   - Name: sto-activity"
        echo "   - Environment: Node"
        echo "   - Build Command: npm install"
        echo "   - Start Command: npm start"
        echo "   - Plan: Free"
        echo ""
        echo "6. Set these environment variables:"
        echo "   NODE_ENV=production"
        echo "   STO_DEFAULT_TIMEZONE=America/Chicago"
        echo "   STO_HOLIDAY_API_ENABLED=true"
        echo "   JWT_SECRET=<generate-secure-random-string>"
        echo ""
        echo "📄 render.yaml configuration file is ready!"
        ;;
    2)
        echo ""
        echo "⚡ Deploying to Vercel"
        echo "====================="
        echo ""
        echo "📋 Steps to complete deployment:"
        echo "1. Install Vercel CLI: npm install -g vercel"
        echo "2. Run: vercel"
        echo "3. Follow the prompts to deploy"
        echo ""
        echo "Or deploy via GitHub:"
        echo "1. Push to GitHub (see Render instructions above)"
        echo "2. Go to https://vercel.com and import your repository"
        echo "3. Set environment variables in Vercel dashboard"
        echo ""
        echo "📄 vercel.json configuration file is ready!"
        ;;
    3)
        echo ""
        echo "📖 Manual Setup Instructions"
        echo "============================"
        echo ""
        echo "1. Choose a platform: Render.com, Vercel, Railway, Heroku, etc."
        echo "2. Create account and connect your GitHub repository"
        echo "3. Configure build settings:"
        echo "   - Build Command: npm install"
        echo "   - Start Command: npm start"
        echo "   - Node.js version: 16+"
        echo ""
        echo "4. Set environment variables (see .env.production.template)"
        echo "5. Deploy and test your endpoints"
        echo ""
        ;;
    *)
        echo "❌ Invalid choice. Please run the script again."
        exit 1
        ;;
esac

echo ""
echo "🧪 After deployment, test these endpoints:"
echo "- Health Check: https://your-app-url/health"
echo "- Configuration UI: https://your-app-url/"
echo "- Debug Config: https://your-app-url/debug/config"
echo ""
echo "📚 For detailed instructions, see DEPLOYMENT_GUIDE.md"
echo ""
echo "🎉 Happy deploying!"