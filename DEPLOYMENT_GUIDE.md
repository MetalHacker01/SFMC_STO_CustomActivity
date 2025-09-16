# 🚀 STO Custom Journey Activity - Deployment Guide

This guide covers deploying the Send Time Optimization (STO) Custom Journey Activity to free cloud services for testing and debugging.

## 📋 Pre-Deployment Checklist

- [x] Application code is ready
- [x] Tests are passing
- [x] Environment variables are configured
- [x] Dependencies are properly defined in package.json

## 🌐 Deployment Options

### Option 1: Render.com (Recommended)

**Why Render?**
- Native Node.js/Express support
- Free tier with 750 hours/month
- Persistent storage and logs
- Easy environment variable management
- Automatic HTTPS
- Good for API endpoints

#### Step 1: Prepare for Render

1. **Create render.yaml configuration:**

```yaml
services:
  - type: web
    name: sto-activity
    env: node
    plan: free
    buildCommand: npm install
    startCommand: npm start
    envVars:
      - key: NODE_ENV
        value: production
      - key: PORT
        value: 10000
```

2. **Update package.json scripts:**
```json
{
  "scripts": {
    "start": "node server-working.js",
    "build": "npm install --production"
  }
}
```

#### Step 2: Deploy to Render

1. **Push to GitHub:**
   ```bash
   git init
   git add .
   git commit -m "Initial STO activity deployment"
   git branch -M main
   git remote add origin https://github.com/yourusername/sto-activity.git
   git push -u origin main
   ```

2. **Connect to Render:**
   - Go to [render.com](https://render.com)
   - Sign up with GitHub
   - Click "New +" → "Web Service"
   - Connect your GitHub repository
   - Configure:
     - **Name:** `sto-activity`
     - **Environment:** `Node`
     - **Build Command:** `npm install`
     - **Start Command:** `npm start`
     - **Plan:** Free

3. **Set Environment Variables:**
   ```
   NODE_ENV=production
   PORT=10000
   STO_DEFAULT_TIMEZONE=America/Chicago
   STO_HOLIDAY_API_ENABLED=true
   JWT_SECRET=your-secure-jwt-secret-here
   SFMC_CLIENT_ID=your-sfmc-client-id
   SFMC_CLIENT_SECRET=your-sfmc-client-secret
   SFMC_SUBDOMAIN=your-sfmc-subdomain
   ```

#### Step 3: Access Your Deployed App
- URL: `https://sto-activity.onrender.com`
- Health Check: `https://sto-activity.onrender.com/health`
- Configuration UI: `https://sto-activity.onrender.com`

---

### Option 2: Vercel (Alternative)

**Why Vercel?**
- Extremely fast deployment
- Great developer experience
- Automatic deployments from Git
- Good for frontend-heavy applications

#### Step 1: Prepare for Vercel

1. **Create vercel.json configuration:**

```json
{
  "version": 2,
  "builds": [
    {
      "src": "server-working.js",
      "use": "@vercel/node"
    }
  ],
  "routes": [
    {
      "src": "/(.*)",
      "dest": "/server-working.js"
    }
  ],
  "env": {
    "NODE_ENV": "production"
  }
}
```

2. **Install Vercel CLI:**
```bash
npm install -g vercel
```

#### Step 2: Deploy to Vercel

1. **Deploy from command line:**
   ```bash
   vercel
   ```
   
2. **Or deploy from GitHub:**
   - Go to [vercel.com](https://vercel.com)
   - Sign up with GitHub
   - Import your repository
   - Configure environment variables

#### Step 3: Set Environment Variables in Vercel
```
NODE_ENV=production
STO_DEFAULT_TIMEZONE=America/Chicago
STO_HOLIDAY_API_ENABLED=true
JWT_SECRET=your-secure-jwt-secret-here
SFMC_CLIENT_ID=your-sfmc-client-id
SFMC_CLIENT_SECRET=your-sfmc-client-secret
SFMC_SUBDOMAIN=your-sfmc-subdomain
```

---

## 🛠️ Quick Deploy Setup

Let me create the deployment files for you:

### For Render.com Deployment

1. **render.yaml** (already created above)
2. **Updated package.json** with proper start script
3. **Environment variables template**

### For Vercel Deployment

1. **vercel.json** (already created above)
2. **Serverless function optimization**

---

## 🧪 Testing Your Deployment

### Health Check
```bash
curl https://your-app-url.onrender.com/health
```

### Configuration Test
```bash
curl -X POST https://your-app-url.onrender.com/save \
  -H "Content-Type: application/json" \
  -d '{
    "skipWeekends": true,
    "skipHolidays": false,
    "timeWindows": [
      {"startHour": 9, "endHour": 10, "enabled": true}
    ]
  }'
```

### Contact Processing Test
```bash
curl -X POST https://your-app-url.onrender.com/execute \
  -H "Content-Type: application/json" \
  -d '{
    "contact": {
      "subscriberKey": "test-001",
      "emailAddress": "test@example.com",
      "geosegment": "US"
    },
    "config": {
      "skipWeekends": true,
      "skipHolidays": false,
      "timeWindows": [
        {"startHour": 10, "endHour": 11, "enabled": true}
      ]
    }
  }'
```

---

## 🔧 Debugging Your Deployment

### Render.com Debugging
- **Logs:** Go to your service dashboard → "Logs" tab
- **Environment:** Check "Environment" tab for variables
- **Events:** Monitor deployments in "Events" tab

### Vercel Debugging
- **Functions:** Check function logs in dashboard
- **Runtime Logs:** View in Vercel dashboard
- **Build Logs:** Check deployment logs

### Common Issues & Solutions

1. **Port Issues:**
   - Render uses PORT environment variable
   - Vercel handles ports automatically

2. **Environment Variables:**
   - Double-check all required variables are set
   - Sensitive values should be marked as secret

3. **Build Failures:**
   - Check Node.js version compatibility
   - Verify all dependencies are in package.json

4. **Runtime Errors:**
   - Check logs for missing modules
   - Verify file paths are correct

---

## 📊 Monitoring Your Deployment

### Built-in Monitoring
- **Render:** Built-in metrics and logs
- **Vercel:** Analytics and function insights

### Custom Monitoring
Your app includes built-in health monitoring:
- Health endpoint: `/health`
- Debug endpoints: `/debug/config`, `/debug/status`
- Performance metrics (if enabled)

---

## 🔐 Security Considerations

### Environment Variables
```bash
# Required for production
JWT_SECRET=generate-a-secure-random-string-here
SFMC_CLIENT_ID=your-actual-sfmc-client-id
SFMC_CLIENT_SECRET=your-actual-sfmc-client-secret
SFMC_SUBDOMAIN=your-actual-sfmc-subdomain

# Optional but recommended
CORS_ENABLED=true
RATE_LIMIT_ENABLED=true
HELMET_ENABLED=true
```

### HTTPS
Both Render and Vercel provide automatic HTTPS certificates.

---

## 🚀 Next Steps After Deployment

1. **Test the deployed application**
2. **Configure SFMC Journey Builder** to use your deployed URL
3. **Monitor logs and performance**
4. **Set up custom domain** (optional)
5. **Configure production monitoring**

---

## 💡 Tips for Success

1. **Start with Render.com** - it's more suitable for Node.js apps
2. **Test locally first** - ensure everything works before deploying
3. **Use environment variables** - never hardcode secrets
4. **Monitor logs** - watch for errors after deployment
5. **Test all endpoints** - verify health, save, validate, and execute work
6. **Check CORS settings** - ensure SFMC can communicate with your app

---

## 📞 Support

If you encounter issues:
1. Check the deployment logs
2. Verify environment variables
3. Test endpoints manually
4. Review the troubleshooting section
5. Check service status pages (Render/Vercel)

Your deployed STO activity will be ready for integration with SFMC Journey Builder!