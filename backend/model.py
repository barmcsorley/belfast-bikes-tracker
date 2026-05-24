from sklearn.ensemble import RandomForestRegressor
import pandas as pd
import numpy as np
from data_loader import generate_mock_training_data

class BikePredictionModel:
    def __init__(self):
        self.model = RandomForestRegressor(n_estimators=100, random_state=42)
        self.is_trained = False

    def train(self):
        print("Dataset generation started...")
        df = generate_mock_training_data()
        print(f"Dataset generated with {len(df)} rows. Training model...")
        
        # Include weather features
        X = df[["station_id", "hour", "day_of_week", "temperature", "is_raining"]]
        y = df[["pedal_bikes_available", "electric_bikes_available"]]
        
        self.model.fit(X, y)
        self.is_trained = True
        print("Model trained successfully.")

    def predict(self, station_id, hour, day_of_week, temperature=12.0, is_raining=0):
        if not self.is_trained:
            raise Exception("Model is not trained yet")
            
        input_data = pd.DataFrame(
            [[station_id, hour, day_of_week, temperature, is_raining]], 
            columns=["station_id", "hour", "day_of_week", "temperature", "is_raining"]
        )
        prediction = self.model.predict(input_data)[0]
        pedal_pred = max(0, int(round(prediction[0])))
        electric_pred = max(0, int(round(prediction[1])))
        
        return {
            "bikes_available": pedal_pred + electric_pred,
            "pedal_bikes_available": pedal_pred,
            "electric_bikes_available": electric_pred
        }
