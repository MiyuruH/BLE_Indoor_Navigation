#include <BLEDevice.h>
#include <BLEServer.h>

static const char *kBeaconName = "No. 300";
static const char *kServiceUuid = "12345678-1234-1234-1234-1234567890ab";

void setup() {
  Serial.begin(115200);
  delay(1000);
  Serial.println("Starting BLE beacon...");

  BLEDevice::init(kBeaconName);

  BLEServer *pServer = BLEDevice::createServer();
  (void)pServer;

  BLEAdvertising *pAdvertising = BLEDevice::getAdvertising();

  BLEAdvertisementData advertisementData;
  advertisementData.setName(kBeaconName);
  advertisementData.setFlags(0x06);
  advertisementData.setCompleteServices(BLEUUID(kServiceUuid));
  pAdvertising->setAdvertisementData(advertisementData);

  BLEAdvertisementData scanResponseData;
  scanResponseData.setName(kBeaconName);
  pAdvertising->setScanResponseData(scanResponseData);

  pAdvertising->setScanResponse(true);
  pAdvertising->setMinInterval(0x20);
  pAdvertising->setMaxInterval(0x40);

  BLEDevice::startAdvertising();
  Serial.println("Beacon No. 300 is Ready!");
}

void loop() {
  delay(1000);
}
