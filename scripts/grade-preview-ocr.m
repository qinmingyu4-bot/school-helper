#import <Foundation/Foundation.h>
#import <Vision/Vision.h>
#import <ImageIO/ImageIO.h>

int main(void) {
  @autoreleasepool {
    NSData *data = [[NSFileHandle fileHandleWithStandardInput] readDataToEndOfFile];
    CGImageSourceRef source = CGImageSourceCreateWithData((__bridge CFDataRef)data, NULL);
    if (!source) return 1;
    CGImageRef image = CGImageSourceCreateImageAtIndex(source, 0, NULL);
    CFRelease(source);
    if (!image) return 1;
    VNRecognizeTextRequest *request = [[VNRecognizeTextRequest alloc] init];
    request.recognitionLevel = VNRequestTextRecognitionLevelAccurate;
    request.recognitionLanguages = @[@"en-US", @"zh-Hans"];
    request.usesLanguageCorrection = NO;
    VNImageRequestHandler *handler = [[VNImageRequestHandler alloc] initWithCGImage:image options:@{}];
    NSError *error = nil;
    BOOL success = [handler performRequests:@[request] error:&error];
    CGImageRelease(image);
    if (!success) return 1;
    NSMutableArray *lines = [NSMutableArray array];
    for (VNRecognizedTextObservation *observation in request.results) {
      VNRecognizedText *candidate = [[observation topCandidates:1] firstObject];
      if (!candidate) continue;
      CGRect rect = observation.boundingBox;
      [lines addObject:@{@"text":candidate.string, @"x":@(CGRectGetMinX(rect)),
                        @"y":@(CGRectGetMidY(rect)), @"height":@(CGRectGetHeight(rect)),
                        @"confidence":@(candidate.confidence)}];
    }
    NSData *output = [NSJSONSerialization dataWithJSONObject:lines options:0 error:&error];
    if (!output) return 1;
    [[NSFileHandle fileHandleWithStandardOutput] writeData:output];
    return 0;
  }
}
