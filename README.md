# Academy Management System

A comprehensive multi-academy sports management system built with React and Firebase.

## Features

- 🏢 **Multi-Organization Support**: Create and manage multiple sports organizations
- 🏫 **Academy Management**: Set up multiple academies under each organization
- 👥 **Role-Based Access Control**: Owner, Admin, Coach, Player, and Guardian roles
- 🔐 **Secure Authentication**: Firebase Auth with protected routes
- 📊 **Dashboard Analytics**: Real-time statistics and user management
- ⚙️ **Customizable Settings**: Custom fields and parameters for players
- 📱 **Responsive Design**: Mobile-friendly interface with Material-UI

## Tech Stack

- **Frontend**: React 18 with TypeScript
- **Backend**: Firebase (Authentication, Firestore, Storage)
- **UI Library**: Material-UI (MUI)
- **Routing**: React Router v6
- **State Management**: React Context API

## Prerequisites

Before running this project, make sure you have:

- Node.js (v16 or higher)
- npm or yarn
- Firebase project with Authentication, Firestore, and Storage enabled

## Setup Instructions

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd academy-management
npm install
```

### 2. Firebase Configuration

1. Create a new Firebase project at [Firebase Console](https://console.firebase.google.com)
2. Enable Authentication with Email/Password provider
3. Enable Firestore Database
4. Enable Storage
5. Copy your Firebase config and update `src/firebase.ts`:

```typescript
const firebaseConfig = {
  apiKey: "your-api-key",
  authDomain: "your-project-id.firebaseapp.com",
  projectId: "your-project-id",
  storageBucket: "your-project-id.appspot.com",
  messagingSenderId: "your-sender-id",
  appId: "your-app-id"
};
```

### 3. Set Up Firestore Security Rules

Deploy the security rules from `firestore.rules` to your Firebase project:

```bash
firebase deploy --only firestore:rules
```

### 4. Start Development Server

```bash
npm start
```

The application will open at `http://localhost:3000`.

## Project Structure

```
src/
├── components/
│   ├── auth/           # Authentication components
│   ├── dashboard/      # Dashboard and layout components
│   ├── organization/   # Organization management
│   ├── academy/        # Academy management
│   ├── users/          # User management (coming soon)
│   ├── settings/       # Settings pages (coming soon)
│   └── common/         # Shared components
├── contexts/           # React contexts for global state
├── services/           # Firebase service functions
├── types/              # TypeScript type definitions
└── utils/              # Utility functions
```

## User Flow

1. **Sign Up**: New users create an account
2. **Create Organization**: Set up the main organization
3. **Create Academies**: Add one or more academies under the organization
4. **Dashboard**: Access the main management interface
5. **User Management**: Add players, coaches, and guardians (coming soon)
6. **Settings**: Configure custom fields and parameters (coming soon)

## Current Features

✅ User authentication (login/signup)  
✅ Organization creation with image upload  
✅ Academy creation and management  
✅ Dashboard with real-time statistics  
✅ Role-based navigation and access control  
✅ Academy switching in dashboard  
🚧 User management system (in progress)  
🚧 Custom player fields and settings  
🚧 Player registration and profiles  

## Upcoming Features

- User management with role assignment
- Player profiles with custom fields
- Guardian linking and management
- Settings for custom parameters
- Reports and analytics
- Bulk operations
- Mobile app (React Native)

## Security

The application implements comprehensive security through:
- Firebase Authentication for user management
- Firestore security rules for data access control
- Role-based permissions at organization and academy levels
- Protected routes and component-level access control

## Available Scripts

### `npm start`
Runs the app in development mode at [http://localhost:3000](http://localhost:3000).

### `npm test`
Launches the test runner in interactive watch mode.

### `npm run build`
Builds the app for production to the `build` folder.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## License

This project is licensed under the MIT License.

## Support

For questions or support, please contact the development team or create an issue in the repository.