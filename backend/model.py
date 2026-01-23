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
        print("Dataset generated. Training model...")
        
        X = df[["station_id", "hour", "day_of_week"]]
        y = df["bikes_available"]
        
        self.model.fit(X, y)
        self.is_trained = True
        print("Model trained successfully.")

    def predict(self, station_id, hour, day_of_week):
        if not self.is_trained:
            raise Exception("Model is not trained yet")
            
        input_data = pd.DataFrame([[station_id, hour, day_of_week]], columns=["station_id", "hour", "day_of_week"])
        prediction = self.model.predict(input_data)[0]
        return max(0, int(round(prediction)))
