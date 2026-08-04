#include <BLEDevice.h>
#include <BLEUtils.h>
#include <BLEServer.h>

void setup() {
  Serial.begin(115200);
  BLEDevice::init("LivingRoom"); // Named another beacon as "Abhishek's room"
  
  BLEServer *pServer = BLEDevice::createServer();
  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();
  
 
  pAdvertising->setScanResponse(true);
  
  pAdvertising->setMinInterval(0x20); 
  pAdvertising->setMaxInterval(0x40); 
  
  BLEDevice::startAdvertising();
  Serial.println("Beacon is Ready!");
}

void loop() { delay(1000); }