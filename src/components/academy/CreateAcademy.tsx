

import React, { useState, useEffect } from 'react';
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
  FormControl,
  Chip
} from '@mui/material';
import { PhotoCamera, Add } from '@mui/icons-material';
import { useAuth } from '../../contexts/AuthContext';
import { createAcademy } from '../../services/academyService';
import { countryOptions, cityOptions } from '../../constants/locations';

const CreateAcademy: React.FC = () => {
  const [name, setName] = useState('');
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const [location, setLocation] = useState('');
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [createdAcademies, setCreatedAcademies] = useState<string[]>([]);
  const navigate = useNavigate();
  const { userData } = useAuth();

  const organizationId = userData?.roles[0]?.organizationId;

  useEffect(() => {
    if (!organizationId) {
      navigate('/create-organization');
      return;
    }
  }, [organizationId, navigate]);

  const handleImageChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setImageFile(e.target.files[0]);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!name.trim() || !country.trim() || !city.trim()) {
      setError('Please fill in all required fields');
      return;
    }

    if (!organizationId) {
      setError('Organization ID is missing');
      return;
    }

    try {
      setError('');
      setLoading(true);
      
      const academy = await createAcademy(
        organizationId,
        {
          name: name.trim(),
          country: country.trim(),
          city: city.trim(),
          location: location.trim(),
          imageUrl: ''
        },
        imageFile || undefined
      );
      
      setCreatedAcademies([...createdAcademies, academy.name]);
      
      // Reset form
      setName('');
      setCountry('');
      setCity('');
      setLocation('');
      setImageFile(null);
      
    } catch (error: any) {
      setError('Failed to create academy. Please try again.');
      console.error('Academy creation error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleFinish = () => {
    navigate('/dashboard');
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
            Create Your Academies
          </Typography>
          <Typography variant="body1" gutterBottom align="center" color="text.secondary">
            Set up the academies under your organization
          </Typography>
          
          {createdAcademies.length > 0 && (
            <Box sx={{ mb: 2 }}>
              <Typography variant="subtitle2" gutterBottom>
                Created Academies:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {createdAcademies.map((academyName, index) => (
                  <Chip key={index} label={academyName} color="success" />
                ))}
              </Box>
            </Box>
          )}
          
          {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
          
          <Box component="form" onSubmit={handleSubmit} sx={{ mt: 3 }}>
            <TextField
              margin="normal"
              required
              fullWidth
              id="name"
              label="Academy Name"
              name="name"
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Downtown Branch"
            />
            
            <TextField
              margin="normal"
              required
              fullWidth
              select
              id="country"
              label="Country"
              value={country}
              onChange={(e) => {
                setCountry(e.target.value);
                setCity(''); // Reset city when country changes
              }}
              SelectProps={{
                native: true,
              }}
            >
              <option value="">Select Country</option>
              {countryOptions.map((countryOption) => (
                <option key={countryOption} value={countryOption}>
                  {countryOption}
                </option>
              ))}
            </TextField>
            
            <TextField
              margin="normal"
              required
              fullWidth
              select
              id="city"
              label="City"
              value={city}
              onChange={(e) => setCity(e.target.value)}
              disabled={!country}
              helperText={!country ? "Please select a country first" : ""}
              SelectProps={{
                native: true,
              }}
            >
              <option value="">{!country ? "Please select country first" : "Select a city"}</option>
              {country && cityOptions[country]?.map((cityOption) => (
                <option key={cityOption} value={cityOption}>
                  {cityOption}
                </option>
              ))}
            </TextField>
            
            <TextField
              margin="normal"
              fullWidth
              id="location"
              label="Address (Optional)"
              name="location"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="e.g., 123 Main St, Suite 100"
            />
            
            <FormControl fullWidth margin="normal">
              <InputLabel shrink htmlFor="academy-image">
                Academy Logo (Optional)
              </InputLabel>
              <Input
                id="academy-image"
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
              startIcon={<Add />}
            >
              {loading ? 'Creating Academy...' : 'Add Academy'}
            </Button>
            
            {createdAcademies.length > 0 && (
              <Button
                fullWidth
                variant="outlined"
                onClick={handleFinish}
                sx={{ mb: 2 }}
              >
                Finish & Go to Dashboard
              </Button>
            )}
          </Box>
        </Paper>
      </Box>
    </Container>
  );
};

export default CreateAcademy;