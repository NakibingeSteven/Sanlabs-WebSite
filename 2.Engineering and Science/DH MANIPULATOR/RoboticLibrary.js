// RoboticLibrary.js

const RoboticLibrary = {
    forwardKinematics: function (linkLengths, jointAngles) {
        // Ensure linkLengths and jointAngles have the same length
        if (linkLengths.length !== jointAngles.length) {
            throw new Error("Link lengths and joint angles must have the same length.");
        }

        // Initialize end-effector position
        let endEffectorPosition = [0, 0];

        // Calculate end-effector position based on forward kinematics equations
        for (let i = 0; i < linkLengths.length; i++) {
            endEffectorPosition[0] += linkLengths[i] * Math.cos(jointAngles[i]);
            endEffectorPosition[1] += linkLengths[i] * Math.sin(jointAngles[i]);
        }

        return endEffectorPosition;
    },
    inverseKinematics: function (endEffectorPosition, linkLengths) {
        // Calculate the distance from the origin to the end effector
        const distance = Math.sqrt(endEffectorPosition[0] ** 2 + endEffectorPosition[1] ** 2);

        // Check if the target is within reach
        if (distance > linkLengths.reduce((acc, cur) => acc + cur)) {
            throw new Error("Target position is out of reach.");
        }

        // Calculate the angles using inverse kinematics equations
        const theta2 = Math.acos((endEffectorPosition[0] ** 2 + endEffectorPosition[1] ** 2 - linkLengths[0] ** 2 - linkLengths[1] ** 2) / (2 * linkLengths[0] * linkLengths[1]));
        const theta1 = Math.atan2(endEffectorPosition[1], endEffectorPosition[0]) - Math.atan2((linkLengths[1] * Math.sin(theta2)), (linkLengths[0] + linkLengths[1] * Math.cos(theta2)));

        return [theta1, theta2];
    },
    createIdentityMatrix: function () {
        return [
            [1, 0, 0, 0],
            [0, 1, 0, 0],
            [0, 0, 1, 0],
            [0, 0, 0, 1]
        ];
    },

    calculateTransformationMatrix: function (theta, d, a, alpha) {
        let m11 = Math.cos(theta);
        let m12 = -Math.sin(theta) * Math.cos(alpha);
        let m13 = Math.sin(theta) * Math.sin(alpha);
        let m14 = a * Math.cos(theta);

        let m21 = Math.sin(theta);
        let m22 = Math.cos(theta) * Math.cos(alpha);
        let m23 = -Math.cos(theta) * Math.sin(alpha);
        let m24 = a * Math.sin(theta);

        let m31 = 0;
        let m32 = Math.sin(alpha);
        let m33 = Math.cos(alpha);
        let m34 = d;

        let m41 = 0;
        let m42 = 0;
        let m43 = 0;
        let m44 = 1;

        return [
            [m11, m12, m13, m14],
            [m21, m22, m23, m24],
            [m31, m32, m33, m34],
            [m41, m42, m43, m44]
        ];
    },

    multiplyMatrices: function (A, B) {
        let result = [];
        for (let i = 0; i < 4; i++) {
            result[i] = [];
            for (let j = 0; j < 4; j++) {
                result[i][j] = 0;
                for (let k = 0; k < 4; k++) {
                    result[i][j] += A[i][k] * B[k][j];
                }
            }
        }
        return result;
    },

    interpretMatrix: function (matrix) {
        const translationVector = [matrix[0][3], matrix[1][3], matrix[2][3]];
        const xVector = [matrix[0][0], matrix[1][0], matrix[2][0]];
        const yVector = [matrix[0][1], matrix[1][1], matrix[2][1]];
        const zVector = [matrix[0][2], matrix[1][2], matrix[2][2]];

        const translationExplanation = `This vector represents the translation of the end-effector relative to the base frame. It indicates the displacement along the X, Y, and Z axes: (${translationVector[0]}, ${translationVector[1]}, ${translationVector[2]}).`;
        const xVectorExplanation = `This vector represents the X-axis of the end-effector frame relative to the base frame. It defines the orientation of the end-effector's X-axis in terms of the base frame's coordinate system: (${xVector[0]}, ${xVector[1]}, ${xVector[2]}).`;
        const yVectorExplanation = `This vector represents the Y-axis of the end-effector frame relative to the base frame. It defines the orientation of the end-effector's Y-axis in terms of the base frame's coordinate system: (${yVector[0]}, ${yVector[1]}, ${yVector[2]}).`;
        const zVectorExplanation = `This vector represents the Z-axis of the end-effector frame relative to the base frame. It defines the orientation of the end-effector's Z-axis in terms of the base frame's coordinate system: (${zVector[0]}, ${zVector[1]}, ${zVector[2]}).`;

        return {
            translationExplanation,
            xVectorExplanation,
            yVectorExplanation,
            zVectorExplanation
        };
    },

    calculateInverseKinematics: function (overallMatrix, desiredX, desiredY, desiredZ) {
        const inverseMatrix = numeric.inv(overallMatrix);
        const desiredPosition = [desiredX, desiredY, desiredZ, 1];
        const inversePosition = numeric.dotMMbig(inverseMatrix, desiredPosition);

        const inverseTheta = Math.atan2(inversePosition[1], inversePosition[0]);
        const inverseD = inversePosition[2];
        const inverseA = Math.sqrt(inversePosition[0] ** 2 + inversePosition[1] ** 2 - Math.pow(d, 2));

        return [inverseTheta, inverseD, inverseA];
    }
};

