const axios = require('axios');
require('dotenv').config();

const Nexus_Api_Key = process.env.Nexus_Api_Key;
const BASE_URL = 'https://frc.nexus/api/v1/event';

// Add this new function to fetch event details
async function fetchEventDetails(eventKey) {
  const url = `${BASE_URL}/${eventKey}`;
  const response = await fetch(url, {
    headers: {
      'Nexus-Api-Key': Nexus_Api_Key
    }
  });
  
  if (!response.ok) {
    throw new Error(`Error fetching event details: ${response.statusText}`);
  }
  
  return response.json();
}

// Don't forget to export the new function
module.exports = {
  fetchEventDetails
};
