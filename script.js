function callNumber(phoneNumber) {
    window.location.href = `tel:${phoneNumber}`;
}

function sendSMS(phoneNumber) {
    navigator.geolocation.getCurrentPosition(position => {
        const mapLink = `https://maps.google.com/?q=${position.coords.latitude},${position.coords.longitude}`;
        const message = encodeURIComponent(`Emergency! Please check this location: ${mapLink}`);
        window.location.href = `sms:${phoneNumber}?body=${message}`;
    });
}

document.addEventListener('DOMContentLoaded', () => {
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(position => {
            const userLocation = [position.coords.longitude, position.coords.latitude];
            
            // Initialize map
            const map = new maplibregl.Map({
                container: 'map',
                style: 'https://api.maptiler.com/maps/streets-v2/style.json?key=T2ydav4L9diNGz0rJvDh',
                center: userLocation,
                zoom: 14
            });

            // Add navigation controls
            map.addControl(new maplibregl.NavigationControl());

            // Add user location marker (blue)
            new maplibregl.Marker({ color: '#2196F3' })
                .setLngLat(userLocation)
                .setPopup(new maplibregl.Popup().setHTML('<h3>Your Location</h3>'))
                .addTo(map);

            // Use Overpass API to find nearby hospitals
            const radius = 1000; // 1km radius
            const overpassQuery = `
                [out:json][timeout:25];
                (
                    // Search for hospitals, clinics, and pharmacies by name
                    node["name"~"[Hh]ospital|[Cc]linic|[Pp]harmacy"](around:${radius},${position.coords.latitude},${position.coords.longitude});
                    way["name"~"[Hh]ospital|[Cc]linic|[Pp]harmacy"](around:${radius},${position.coords.latitude},${position.coords.longitude});
                    
                    // Also get specifically tagged facilities
                    node["amenity"~"hospital|clinic|pharmacy"](around:${radius},${position.coords.latitude},${position.coords.longitude});
                    way["amenity"~"hospital|clinic|pharmacy"](around:${radius},${position.coords.latitude},${position.coords.longitude});
                    
                    // Include healthcare tagged facilities
                    node["healthcare"~"hospital|clinic"](around:${radius},${position.coords.latitude},${position.coords.longitude});
                    way["healthcare"~"hospital|clinic"](around:${radius},${position.coords.latitude},${position.coords.longitude});
                );
                out body;
                >;
                out skel qt;
            `;

            const overpassUrl = `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(overpassQuery)}`;

            fetch(overpassUrl)
                .then(response => response.json())
                .then(data => {
                    const buildings = data.elements.filter(element => 
                        element.tags && 
                        element.tags.name && 
                        (element.lat !== undefined && element.lon !== undefined)
                    );

                    console.log('Found buildings:', buildings);

                    // Filter and sort hospitals and clinics
                    const medicalFacilities = buildings.filter(building => {
                        if (!building.tags || !building.tags.name) return false;
                        
                        const name = building.tags.name.toLowerCase();
                        const isHospital = name.includes('hospital') || 
                                          building.tags.amenity === 'hospital' ||
                                          building.tags.healthcare === 'hospital';
                        const isClinic = name.includes('clinic') || 
                                        building.tags.amenity === 'clinic' ||
                                        building.tags.healthcare === 'clinic';
                        const isPharmacy = name.includes('pharmacy') || 
                                          building.tags.amenity === 'pharmacy';
                        
                        // Debug log
                        if (isHospital || isClinic || isPharmacy) {
                            console.log('Found facility:', {
                                name: building.tags.name,
                                tags: building.tags,
                                isHospital,
                                isClinic,
                                isPharmacy
                            });
                        }
                        
                        return isHospital || isClinic || isPharmacy;
                    }).sort((a, b) => {
                        // Sort to prioritize hospitals over clinics and pharmacies
                        const aIsHospital = a.tags.name.toLowerCase().includes('hospital');
                        const bIsHospital = b.tags.name.toLowerCase().includes('hospital');
                        return bIsHospital - aIsHospital;
                    });

                    medicalFacilities.forEach(facility => {
                        console.log('Medical Facility:', {
                            name: facility.tags.name,
                            lat: facility.lat,
                            lon: facility.lon
                        });

                        const coordinates = [facility.lon, facility.lat];
                        const name = facility.tags.name;
                        const type = getFacilityType(facility.tags);
                        
                        // Calculate distance from user location
            const distance = calculateDistance(
                            position.coords.latitude, position.coords.longitude,
                            facility.lat, facility.lon
            ).toFixed(1);

                        // Create custom marker element
                        const markerEl = document.createElement('div');
                        markerEl.innerHTML = `
                            <svg width="24" height="24" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                <rect x="2" y="2" width="20" height="20" fill="white"/>
                                <path d="M5 5h14v14h-14z" fill="${getMarkerColor(type)}"/>
                                <path d="M11 7h2v10h-2z M7 11h10v2h-10z" fill="white"/>
                            </svg>
                        `;
                        markerEl.style.cssText = `
                            width: ${type === 'Hospital' ? '28px' : '24px'};
                            height: ${type === 'Hospital' ? '28px' : '24px'};
                            cursor: pointer;
                            background: white;
                            border-radius: 2px;
                            box-shadow: 0 0 4px rgba(0,0,0,0.3);
                            z-index: ${type === 'Hospital' ? '2' : '1'};
                        `;

                        // Add marker for facility
                        const marker = new maplibregl.Marker({
                            element: markerEl,
                            anchor: 'center'
                        })
                .setLngLat(coordinates)
                .setPopup(new maplibregl.Popup().setHTML(`
                    <h3>${name}</h3>
                            <p class="facility-type">${type}</p>
                    <p>${distance} km away</p>
                            <button onclick="callNumber('${getHospitalPhoneNumber(name)}')" class="call-btn">
                                <i class="fas fa-phone"></i> Call
                            </button>
                `))
                .addTo(map);

                        // Add to facility list
                        addFacilityToList(name, coordinates, distance, type);
        });

        // Fit map to show all markers
                    if (medicalFacilities.length > 0) {
        const bounds = new maplibregl.LngLatBounds();
                        medicalFacilities.forEach(facility => {
                            bounds.extend([facility.lon, facility.lat]);
        });
        bounds.extend(userLocation);
        map.fitBounds(bounds, { padding: 50 });
                    }
                })
                .catch(error => {
                    console.error('Error fetching hospitals:', error);
                });
        });
    }
});

// Add this function to calculate distance between two points
function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Radius of the earth in km
    const dLat = deg2rad(lat2 - lat1);
    const dLon = deg2rad(lon2 - lon1);
    const a = 
        Math.sin(dLat/2) * Math.sin(dLat/2) +
        Math.cos(deg2rad(lat1)) * Math.cos(deg2rad(lat2)) * 
        Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    const d = R * c; // Distance in km
    return d;
}

function deg2rad(deg) {
    return deg * (Math.PI/180);
}

// Update the addHospitalToList function to handle facility types
function addFacilityToList(name, coordinates, distance, type) {
    const hospitalList = document.getElementById('hospitalList');
    const li = document.createElement('li');
    const phoneNumber = getHospitalPhoneNumber(name);
    
    li.innerHTML = `
        <div class="hospital-info">
            <i class="fas ${getFacilityIcon(type)}" style="color: ${getMarkerColor(type)}"></i>
            <div class="hospital-details">
                <span class="hospital-name">${name}</span>
                <span class="facility-type">${type}</span>
                <span class="hospital-distance">${distance} km away</span>
                <span class="hospital-phone">${phoneNumber}</span>
            </div>
        </div>
        <div class="hospital-buttons">
            <button onclick="callNumber('${phoneNumber}')" class="call-btn">
                <i class="fas fa-phone"></i> Call
            </button>
        </div>
    `;

    // Insert based on type priority
    if (type === 'Hospital') {
        hospitalList.insertBefore(li, hospitalList.firstChild);
    } else {
        hospitalList.appendChild(li);
    }
}

// Function to get hospital phone numbers
function getHospitalPhoneNumber(hospitalName) {
    const phoneNumbers = {
        "Manmohan Memorial Hospital": "+977 1-1234567",
        "Rusi Medical Hall": "+977 1-7654321",
        "Shankarapur Hospital": "+977 1-4993061",  // Updated with actual number if available
        "Nepal Orthopaedic Hospital": "+977 1-4494725",  // Updated with actual number if available
        // Add more hospitals and their phone numbers here
    };
    return phoneNumbers[hospitalName] || "Unknown"; // Return "Unknown" if not found
}

// Helper function to determine facility type
function getFacilityType(tags) {
    const name = tags.name.toLowerCase();
    if (name.includes('hospital') || tags.amenity === 'hospital' || tags.healthcare === 'hospital') return 'Hospital';
    if (name.includes('clinic') || tags.amenity === 'clinic' || tags.healthcare === 'clinic') return 'Clinic';
    if (name.includes('pharmacy') || tags.amenity === 'pharmacy') return 'Pharmacy';
    return 'Medical Facility';
}

// Helper function to get marker color
function getMarkerColor(type) {
    switch (type) {
        case 'Hospital': return '#FF0000';  // Bright red for hospitals
        case 'Clinic': return '#FF6B6B';    // Light red for clinics
        case 'Pharmacy': return '#4CAF50';  // Green for pharmacies
        default: return '#FF6B6B';
    }
}

// Helper function to get facility icon
function getFacilityIcon(type) {
    switch (type) {
        case 'Hospital': return 'fa-hospital';
        case 'Clinic': return 'fa-clinic-medical';
        case 'Pharmacy': return 'fa-prescription-bottle-medical';
        default: return 'fa-hospital';
    }
}

// Update the First Aid Procedures object to include all emergency types
const firstAidProcedures = {
    bleeding: {
        title: "Bleeding",
        steps: [
            "Apply direct pressure to the wound using a clean cloth or sterile gauze",
            "Keep pressure applied for at least 15 minutes",
            "If blood soaks through, add more gauze or cloth without removing the first layer",
            "Once bleeding stops, clean and dress the wound",
            "Seek medical attention for severe bleeding"
        ]
    },
    burns: {
        title: "Burns",
        steps: [
            "Cool the burn under cool (not cold) running water for at least 10 minutes",
            "Remove any jewelry or tight items from the burned area",
            "Cover with a sterile gauze bandage",
            "Don't apply ice, butter, or ointments",
            "Seek medical attention for severe burns"
        ]
    },
    choking: {
        title: "Choking",
        steps: [
            "Encourage the person to cough",
            "If they can't cough, speak, or breathe, stand behind them",
            "Give 5 sharp blows between their shoulder blades",
            "If unsuccessful, perform abdominal thrusts (Heimlich maneuver)",
            "Call emergency services if the person becomes unconscious"
        ]
    },
    fracture: {
        title: "Fractures",
        steps: [
            "Keep the injured area still and supported",
            "Apply ice wrapped in a cloth to reduce swelling",
            "Check for circulation beyond the injury",
            "Don't attempt to realign the bone",
            "Seek immediate medical attention"
        ]
    },
    heartAttack: {
        title: "Heart Attack",
        steps: [
            "Call emergency services immediately",
            "Help the person sit down and stay calm",
            "Loosen any tight clothing",
            "If prescribed, help them take their heart medication",
            "Be prepared to perform CPR if needed"
        ]
    },
    cpr: {
        title: "CPR",
        steps: [
            "Check the scene is safe and check for response",
            "Call emergency services",
            "Check for breathing",
            "Begin chest compressions: 30 compressions at 100-120 per minute",
            "Give 2 rescue breaths",
            "Continue cycles of 30 compressions and 2 breaths"
        ]
    },
    allergic: {
        title: "Allergic Reaction",
        steps: [
            "Identify and remove the trigger if possible",
            "Check for severe symptoms (difficulty breathing, swelling)",
            "Use epinephrine auto-injector if available and prescribed",
            "Call emergency services for severe reactions",
            "Keep the person calm and monitor their breathing"
        ]
    },
    stroke: {
        title: "Stroke",
        steps: [
            "Remember FAST: Face drooping, Arm weakness, Speech difficulty, Time to call emergency",
            "Note the time symptoms started",
            "Keep the person still and calm",
            "Do not give them anything to eat or drink",
            "Call emergency services immediately"
        ]
    },
    seizure: {
        title: "Seizure",
        steps: [
            "Clear the area of hazards",
            "Protect the head with something soft",
            "Time the seizure",
            "Do not restrain the person or put anything in their mouth",
            "Place them in recovery position after seizure stops"
        ]
    },
    heatstroke: {
        title: "Heat Stroke",
        steps: [
            "Move to a cool place",
            "Remove excess clothing",
            "Cool the body with water or wet cloths",
            "Place ice packs at neck, armpits, and groin",
            "Call emergency services immediately"
        ]
    },
    poisoning: {
        title: "Poisoning",
        steps: [
            "Call poison control center immediately",
            "Do not induce vomiting unless instructed",
            "Collect the poison container/sample if safe",
            "Check breathing and consciousness",
            "Follow poison control center's instructions"
        ]
    },
    drowning: {
        title: "Drowning",
        steps: [
            "Ensure scene safety",
            "Remove from water if safe to do so",
            "Check breathing and start CPR if needed",
            "Call emergency services",
            "Keep the person warm"
        ]
    }
};

let selectedProcedure = null;

// Add click handlers for emergency items
document.addEventListener('DOMContentLoaded', () => {
    const firstAidItems = document.querySelectorAll('.first-aid-item');
    const guidanceBtn = document.querySelector('.guidance-btn');

    firstAidItems.forEach(item => {
        item.addEventListener('click', () => {
            // Remove active class from all items
            firstAidItems.forEach(i => i.classList.remove('active'));
            // Add active class to clicked item
            item.classList.add('active');
            // Store selected procedure
            selectedProcedure = item.dataset.procedure;
            // Enable guidance button
            guidanceBtn.disabled = false;
        });
    });
});

async function getFirstAidGuidance() {
    if (!selectedProcedure) {
        alert('Please select an emergency type');
        return;
    }

    const procedure = firstAidProcedures[selectedProcedure];
    const situationInput = document.getElementById('situationInput').value.trim();
    const guidanceContent = document.getElementById('guidanceContent');
    
    // Get user's medical information
    const userInfo = {
        name: "Rakesh Rana",
        age: 43,
        bloodGroup: "O+",
        allergies: ["Penicillin", "Peanuts"],
        conditions: ["Type 2 Diabetes", "Hypertension"],
        medications: ["Metformin (500mg)", "Lisinopril (10mg)"]
    };

    // Show loading state
    guidanceContent.innerHTML = `
        <div class="loading-indicator">
            <i class="fas fa-spinner fa-spin"></i> Getting personalized guidance...
        </div>
    `;
    guidanceContent.style.display = 'block';

    try {
        let prompt = `You are a first aid expert. Given a patient with the following medical profile:
- Age: ${userInfo.age}
- Medical Conditions: ${userInfo.conditions.join(', ')}
- Allergies: ${userInfo.allergies.join(', ')}
- Current Medications: ${userInfo.medications.join(', ')}

They are experiencing a ${procedure.title} emergency.`;

        if (situationInput) {
            prompt += `\n\nAdditional situation details: ${situationInput}`;
        }

        prompt += `\n\nProvide specific first aid guidance considering their medical conditions. Be concise but thorough. Focus on:
1. Immediate actions needed
2. What to avoid given their conditions
3. When to call emergency services
4. Special precautions due to their medical conditions`;

        const response = await fetch('https://api.together.xyz/inference', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer c3dd1f5e4c5b08dd4c5d7fd554a65a2eca6a7abea6c2ba0f5d76b31c16140c02'
            },
            body: JSON.stringify({
                model: 'mistralai/Mixtral-8x7B-Instruct-v0.1',
                prompt: prompt,
                max_tokens: 512,
                temperature: 0.7,
                top_p: 0.7,
                top_k: 50,
                repetition_penalty: 1,
                stop: ['Human:', 'Assistant:']
            })
        });

        const data = await response.json();
        
        if (data.output && data.output.choices && data.output.choices[0]) {
            const guidance = data.output.choices[0].text;
            guidanceContent.innerHTML = `
                <h3>${procedure.title} - First Aid Guidance</h3>
                <div class="guidance-text">
                    ${guidance.split('\n').map(line => `<p>${line}</p>`).join('')}
                </div>
                <div class="guidance-disclaimer">
                    <i class="fas fa-exclamation-triangle"></i>
                    <small>This is AI-generated guidance considering your medical conditions. In serious emergencies, always call emergency services immediately.</small>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error getting AI guidance:', error);
        guidanceContent.innerHTML = `
            <div class="error-message">
                <i class="fas fa-exclamation-circle"></i>
                <p>Unable to get personalized guidance. Please call emergency services if needed.</p>
            </div>
        `;
    }
}

// Search functionality
document.addEventListener('DOMContentLoaded', () => {
    const searchInput = document.getElementById('searchInput');
    if (searchInput) {
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const firstAidItems = document.querySelectorAll('.first-aid-item');
            
            firstAidItems.forEach(item => {
                const text = item.textContent.toLowerCase();
                if (text.includes(searchTerm)) {
                    item.style.display = 'flex';
                } else {
                    item.style.display = 'none';
                }
            });
        });
    }
}); 