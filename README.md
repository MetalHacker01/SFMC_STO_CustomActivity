# 🚀 SFMC Send Time Optimization (STO) Custom Journey Activity

A powerful Salesforce Marketing Cloud Custom Journey Activity that optimizes email send times based on geographic segments, time zones, and business rules.

## 🌟 Features

- **🌍 Geographic Send Time Optimization**: Automatically calculates optimal send times based on contact's country code (Geosegment field)
- **⏰ Time Zone Intelligence**: Converts local business hours to SFMC server time (CST/UTC-6) for accurate scheduling
- **📅 Weekend & Holiday Exclusions**: Configurable options to skip weekends and public holidays
- **🎯 Flexible Time Windows**: Define multiple time windows for email delivery (9 AM - 4 PM range)
- **🔄 Wait By Attribute Integration**: Seamlessly works with SFMC's Wait By Attribute activity
- **📊 Real-time Preview**: Visual calendar and time slot previews in the configuration UI
- **🛡️ Error Recovery**: Robust error handling with graceful fallback mechanisms
- **📈 Performance Monitoring**: Built-in health checks and performance metrics
- **🧪 Comprehensive Testing**: Full test suite with journey workflow validation

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Journey       │    │   STO Activity   │    │  Wait By        │
│   Entry         │───▶│   Processing     │───▶│  Attribute      │
│                 │    │                  │    │                 │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              │
                              ▼
                       ┌──────────────────┐
                       │  Data Extension  │
                       │  ConvertedTime   │
                       │  Update          │
                       └──────────────────┘
```

## 🚀 Quick Start

### Prerequisites
- Node.js 16+
- npm or yarn
- Salesforce Marketing Cloud account
- GitHub account (for deployment)

### Local Development

1. **Clone the repository:**
   ```bash
   git clone https://github.com/MetalHacker01/SFMC_STO_CustomActivity.git
   cd SFMC_STO_CustomActivity
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Set up environment variables:**
   ```bash
   cp .env.local .env
   # Edit .env with your configuration
   ```

4. **Start the development server:**
   ```bash
   npm run dev
   ```

5. **Open your browser:**
   ```
   http://localhost:3000
   ```

### Testing

```bash
# Run all tests
npm test

# Run specific test suites
npm test -- tests/journey-complete-workflow.test.js
npm test -- tests/contact-processor.test.js

# Run with coverage
npm run test:coverage
```

## 🌐 Deployment

### Deploy to Render.com (Recommended)

1. **Push to GitHub** (if not already done)
2. **Go to [Render.com](https://render.com)** and sign up
3. **Create a new Web Service** from your GitHub repo
4. **Configure:**
   - Build Command: `npm install`
   - Start Command: `npm start`
   - Environment: Node
   - Plan: Free

5. **Set Environment Variables:**
   ```
   NODE_ENV=production
   JWT_SECRET=your-secure-jwt-secret
   SFMC_CLIENT_ID=your-sfmc-client-id
   SFMC_CLIENT_SECRET=your-sfmc-client-secret
   SFMC_SUBDOMAIN=your-sfmc-subdomain
   ```

### Deploy to Vercel (Alternative)

```bash
npm install -g vercel
vercel
```

For detailed deployment instructions, see [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md).

## 📖 Usage

### 1. Configure the Activity

Access the configuration UI at your deployed URL:
- Set time windows (9 AM - 4 PM range)
- Enable/disable weekend exclusions
- Enable/disable holiday exclusions
- Preview your configuration with the calendar view

### 2. Add to Journey Builder

1. **Install the Custom Activity** in SFMC Journey Builder
2. **Configure the endpoint** to point to your deployed URL
3. **Add the STO activity** to your journey
4. **Follow with Wait By Attribute** activity using the `ConvertedTime` field

### 3. Journey Flow Example

```
Contact Entry → STO Activity → Wait By Attribute → Email Send
                     ↓              ↓
              ConvertedTime    Wait until
              Calculation      ConvertedTime
```

## 🔧 Configuration Options

### Time Windows
- **Available Hours**: 9:00 AM - 4:00 PM (local time)
- **Granularity**: 1-hour windows
- **Multiple Selection**: Choose multiple windows for flexibility

### Day Restrictions
- **Skip Weekends**: Exclude Saturday and Sunday
- **Skip Holidays**: Exclude public holidays based on country code

### Supported Countries
- 🇺🇸 United States (US)
- 🇧🇷 Brazil (BR)
- 🇯🇵 Japan (JP)
- 🇬🇧 United Kingdom (GB)
- 🇦🇺 Australia (AU)
- And more...

## 🧪 Testing & Validation

### API Endpoints

#### Health Check
```bash
GET /health
```

#### Save Configuration
```bash
POST /save
Content-Type: application/json

{
  "skipWeekends": true,
  "skipHolidays": false,
  "timeWindows": [
    {"startHour": 9, "endHour": 10, "enabled": true}
  ]
}
```

#### Process Contact
```bash
POST /execute
Content-Type: application/json

{
  "contact": {
    "subscriberKey": "12345",
    "emailAddress": "test@example.com",
    "geosegment": "US"
  },
  "config": {
    "skipWeekends": true,
    "timeWindows": [
      {"startHour": 10, "endHour": 11, "enabled": true}
    ]
  }
}
```

### Test Scenarios

The application includes comprehensive test coverage:
- ✅ Unit tests for core functionality
- ✅ Integration tests for SFMC API
- ✅ End-to-end journey workflow tests
- ✅ Performance and load tests
- ✅ Error handling and recovery tests

## 📊 Monitoring

### Built-in Health Monitoring
- **Health Endpoint**: `/health`
- **Debug Configuration**: `/debug/config`
- **System Status**: `/debug/status`

### Performance Metrics
- Contact processing time
- API response times
- Error rates and recovery
- Memory and CPU usage

## 🛡️ Security

- **JWT Token Validation**: Secure communication with SFMC
- **Environment Variables**: Sensitive data protection
- **CORS Configuration**: Controlled cross-origin requests
- **Rate Limiting**: Protection against abuse
- **Input Validation**: Sanitized user inputs

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check the `/docs` folder for detailed guides
- **Issues**: Report bugs and request features via GitHub Issues
- **Discussions**: Join the community discussions

## 🎯 Roadmap

- [ ] Additional timezone support
- [ ] Custom holiday calendar integration
- [ ] Advanced time window patterns
- [ ] A/B testing capabilities
- [ ] Enhanced analytics and reporting
- [ ] Multi-language support

## 🏆 Acknowledgments

- Salesforce Marketing Cloud team for the Journey Builder platform
- Open source community for the amazing tools and libraries
- Contributors who help improve this project

---

**Made with ❤️ for the SFMC community**

For questions or support, please open an issue or reach out to the maintainers.
=======
# SFMC_STO_CustomActivity
Custom Journey Builder Activity to manage the send date and time for always-on journeys
>>>>>>> 2ef7985a23f21b809f2b2e9565b0b7ee8dbc17e4
