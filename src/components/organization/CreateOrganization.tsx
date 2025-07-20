import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Container,
  Paper,
  TextField,
  Button,
  Typography,
  Box,
  Alert,
  Input,
  InputLabel,
  FormControl
} from '@mui/material';
import { PhotoCamera } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { createOrganization } from '../../services/organizationService';

const CreateOrganization: React.FC = () => {
  const [name, setName] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const navigate = useNavigate();
  const { currentUser, refreshUserData } = useAuth();

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim()) {
      setError('Please enter an organization name');
      return;
    }

    if (!currentUser) {
      setError('You must be logged in to create an organization');
      return;
    }

    try {
      setError('');
      setLoading(true);
      
      await createOrganization(
        {
          name: name.trim(),
          imageUrl: '',
          ownerId: currentUser.uid
        },
        currentUser.uid,
        imageFile || undefined
      );
      
      // Refresh user data to update roles
      await refreshUserData();
      
      navigate('/create-academy');
    } catch (error: any) {
      setError('Failed to create organization. Please try again.');
      console.error('Organization creation error:', error);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Container maxWidth="sm">
      <Box
        display="flex"
        flexDirection="column"
        alignItems="center"
        justifyContent="center"
        minHeight="100vh"
      >
        <Paper elevation={3} sx={{ padding: 4, width: '100%' }}>
          <Typography variant="h4" component="h1" gutterBottom align="center">
            Create Your Organization
          </Typography>
          <Typography variant="body1" gutterBottom align="center" color="text.secondary">
            Let's start by setting up your organization details
          </Typography>
          
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="name"
              label="Organization Name"
              name="name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Elite Sports Academy"
            />
            
            <FormControl fullWidth margin="normal">
              <InputLabel shrink htmlFor="organization-image">
                Organization Logo (Optional)
              </InputLabel>
              <Input
                id="organization-image"
                type="file"
                inputProps={{ accept: 'image/*' }}
                onChange={handleImageChange}
                startAdornment={<PhotoCamera sx={{ mr: 1 }} />}
              />
              {imageFile && (
                <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                  Selected: {imageFile.name}
                </Typography>
              )}
            </FormControl>
            
            <Button
              type="submit"
              fullWidth
              variant="contained"
              sx={{ mt: 3, mb: 2 }}
              disabled={loading}
            >
              {loading ? 'Creating Organization...' : 'Create Organization'}
            </Button>
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default CreateOrganization;